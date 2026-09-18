"""Reads recorded session logs and rolls them up into the shapes both consumers need:
`scripts/latency_report.py` (p50/p95 for the README) and the HTTP API behind the
frontend's latency and benchmark views.

Pipecat's contribution keys are finer-grained than the four stages the waterfall chart
shows, so the mapping from key to stage lives here -- one place, so the chart and the
report can never disagree about what counts as "ASR".
"""

import re
from collections import defaultdict
from pathlib import Path

from app.telemetry.events import SessionTurnRecord
from app.telemetry.session_recorder import DEFAULT_SESSIONS_DIR

Stage = str

# Which pipeline stage each of Pipecat's contribution keys belongs to. Unrecognised keys
# fold into "other" rather than being silently dropped, so a new Pipecat contribution
# shows up as unattributed time instead of vanishing from the total.
STAGE_OF_KEY: dict[str, Stage] = {
    "endpointing_wait": "vad",
    "turn_detection": "vad",
    "transcription": "asr",
    "llm_inference": "llm",
    "sentence_aggregation": "tts",
    "speech_synthesis": "tts",
    "output_transport": "tts",
}
STAGES: tuple[Stage, ...] = ("vad", "asr", "llm", "tts", "other")

# Contributions that are real time but are not the turn's cost. `first_request` runs from
# client_connected to the first request, so on turn 1 it carries the whole connection
# setup -- tens of seconds locally. Counting it as turn latency would inflate every
# number on the chart, so it is reported separately as setup rather than as a stage.
SETUP_KEYS = frozenset({"first_request"})

SESSION_FILENAME = re.compile(r"^(?P<session_id>[^_]+)_(?P<mode>.+)\.jsonl$")


def session_files(sessions_dir: Path = DEFAULT_SESSIONS_DIR) -> list[Path]:
    if not sessions_dir.is_dir():
        return []
    return sorted(
        (p for p in sessions_dir.glob("*.jsonl") if SESSION_FILENAME.match(p.name)),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )


def load_file(path: Path) -> list[SessionTurnRecord]:
    return [
        SessionTurnRecord.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def load_records(paths: list[Path]) -> list[SessionTurnRecord]:
    return [record for path in paths for record in load_file(path)]


def percentile(values: list[float], p: float) -> float | None:
    """Linear-interpolated percentile. `p` is a fraction, e.g. 0.95."""
    if not values:
        return None
    values = sorted(values)
    k = (len(values) - 1) * p
    f, c = int(k), min(int(k) + 1, len(values) - 1)
    return values[f] + (values[c] - values[f]) * (k - f)


def stage_breakdown_ms(record: SessionTurnRecord) -> tuple[dict[Stage, float], float]:
    """Per-stage milliseconds for one turn, plus the setup milliseconds held out of it."""
    totals: dict[Stage, float] = dict.fromkeys(STAGES, 0.0)
    setup_ms = 0.0
    for contribution in record.breakdown.contributions:
        ms = contribution.duration_secs * 1000
        if contribution.key in SETUP_KEYS:
            setup_ms += ms
        else:
            totals[STAGE_OF_KEY.get(contribution.key, "other")] += ms
    return totals, setup_ms


def turn_view(record: SessionTurnRecord, index: int) -> dict:
    """One waterfall row: stage widths plus the totals the chart annotates."""
    stages, setup_ms = stage_breakdown_ms(record)
    turn_secs = record.breakdown.user_turn_secs
    return {
        "turn": index,
        "recorded_at": record.recorded_at,
        "turn_taking_mode": record.turn_taking_mode,
        "stages": {stage: round(ms, 1) for stage, ms in stages.items()},
        # The sum of the stages, deliberately not breakdown.total_secs: that one is
        # measured from client_connected, so it carries the connection setup that
        # SETUP_KEYS holds out.
        "total_ms": round(sum(stages.values()), 1),
        "setup_ms": round(setup_ms, 1),
        "turn_taking_ms": round(turn_secs * 1000, 1) if turn_secs else None,
    }


def session_summary(path: Path) -> dict:
    match = SESSION_FILENAME.match(path.name)
    assert match is not None  # session_files() only yields names that match
    records = load_file(path)
    totals = [turn_view(r, i)["total_ms"] for i, r in enumerate(records, start=1)]
    return {
        "session_id": match["session_id"],
        "turn_taking_mode": match["mode"],
        "turns": len(records),
        "recorded_at": records[-1].recorded_at if records else path.stat().st_mtime,
        "p50_ms": round(percentile(totals, 0.5) or 0, 1) if totals else None,
        "p95_ms": round(percentile(totals, 0.95) or 0, 1) if totals else None,
    }


def mode_summaries(sessions_dir: Path = DEFAULT_SESSIONS_DIR) -> list[dict]:
    """Per-A/B-arm latency across every recorded session. Arms with no recorded turns
    are omitted, so the caller can tell "not run yet" from "ran and scored badly".
    """
    by_mode: dict[str, list[float]] = defaultdict(list)
    turn_overhead: dict[str, list[float]] = defaultdict(list)
    sessions: dict[str, int] = defaultdict(int)

    for path in session_files(sessions_dir):
        match = SESSION_FILENAME.match(path.name)
        assert match is not None
        mode = match["mode"]
        sessions[mode] += 1
        for i, record in enumerate(load_file(path), start=1):
            view = turn_view(record, i)
            by_mode[mode].append(view["total_ms"])
            if view["turn_taking_ms"] is not None:
                turn_overhead[mode].append(view["turn_taking_ms"])

    return [
        {
            "turn_taking_mode": mode,
            "turns": len(totals),
            "sessions": sessions[mode],
            "p50_ms": round(percentile(totals, 0.5) or 0, 1),
            "p95_ms": round(percentile(totals, 0.95) or 0, 1),
            "mean_ms": round(sum(totals) / len(totals), 1),
            "turn_taking_p50_ms": (
                round(percentile(turn_overhead[mode], 0.5) or 0, 1) if turn_overhead[mode] else None
            ),
        }
        for mode, totals in sorted(by_mode.items())
        if totals
    ]


def nice_bucket_ms(span_ms: float, buckets: int) -> float:
    """Round a bucket width up to the next 1/2/5 x 10^n, so axis labels stay readable."""
    if span_ms <= 0:
        return 100.0
    raw = span_ms / buckets
    magnitude = 10 ** int(max(0, len(str(int(raw))) - 1))
    for step in (1, 2, 5, 10):
        if raw <= step * magnitude:
            return float(step * magnitude)
    return float(10 * magnitude)


def histogram(values: list[float], bucket_ms: float | None = None, buckets: int = 9) -> list[dict]:
    """Buckets for the distribution chart, with the last one open-ended.

    Bucket width defaults to whatever fits the data: a local CPU stack runs seconds per
    turn while a tuned cloud stack runs hundreds of milliseconds, and a width hardcoded
    for either makes the other a single bar.
    """
    if bucket_ms is None:
        bucket_ms = nice_bucket_ms(max(values, default=0), buckets - 1)
    counts = [0] * buckets
    for value in values:
        index = min(int(value // bucket_ms), buckets - 1)
        counts[index] += 1
    peak = max(counts) or 1
    return [
        {
            "label": (
                f">{int(bucket_ms * (buckets - 1))}"
                if i == buckets - 1
                else f"{int(bucket_ms * i)}-{int(bucket_ms * (i + 1))}"
            ),
            "from_ms": bucket_ms * i,
            "count": count,
            "height": round(count / peak * 100, 1),
        }
        for i, count in enumerate(counts)
    ]
