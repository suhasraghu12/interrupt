"""Reads recorded sessions/*.jsonl (written by SessionRecorder, one line per turn) and
produces the F6 latency breakdown chart plus p50/p95 numbers for the README.

Usage:
    python backend/scripts/latency_report.py sessions/*.jsonl
    python backend/scripts/latency_report.py sessions/*.jsonl --out docs/latency_breakdown.png

Not part of the `app` package -- this is a standalone dev tool, run directly against
recorded session logs, not imported by the running agent.
"""

import argparse
import glob
import sys
from pathlib import Path

import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).parent.parent))
from app.telemetry.events import SessionTurnRecord

# Categorical order + validated hex values from the dataviz skill's reference palette
# (references/palette.md) -- passes the adjacent-pair CVD gate for stacked bars in both
# light and dark mode. Ordered to match the typical chronological path of a turn; keys
# outside this list (rare, e.g. tool-call related) fold into MUTED rather than getting
# an assigned hue, per the skill's "fold to Other past N slots" guidance.
KEY_COLORS: dict[str, str] = {
    "endpointing_wait": "#2a78d6",  # blue -- VAD/turn-taking silence wait
    "transcription": "#eb6834",  # orange -- STT
    "turn_detection": "#1baf7a",  # aqua -- turn analyzer / semantic EOU
    "llm_inference": "#eda100",  # yellow -- LLM TTFB
    "sentence_aggregation": "#e87ba4",  # magenta -- TTS text aggregation
    "speech_synthesis": "#008300",  # green -- TTS TTFB
    "output_transport": "#4a3aa7",  # violet -- audio out
}
MUTED = "#898781"  # chrome/muted ink, for any key not in the fixed order above
INK_PRIMARY = "#0b0b0b"
INK_SECONDARY = "#52514e"
GRIDLINE = "#e1e0d9"
SURFACE = "#fcfcfb"


def load_records(patterns: list[str]) -> list[SessionTurnRecord]:
    paths = [p for pattern in patterns for p in glob.glob(pattern)]
    records = []
    for path in paths:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(SessionTurnRecord.model_validate_json(line))
    return records


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    k = (len(values) - 1) * p
    f, c = int(k), min(int(k) + 1, len(values) - 1)
    return values[f] + (values[c] - values[f]) * (k - f)


def print_summary(records: list[SessionTurnRecord]) -> None:
    by_mode: dict[str, list[SessionTurnRecord]] = {}
    for r in records:
        by_mode.setdefault(r.turn_taking_mode, []).append(r)

    for mode, recs in sorted(by_mode.items()):
        totals = [r.breakdown.total_secs for r in recs]
        turn_secs = [r.breakdown.user_turn_secs for r in recs if r.breakdown.user_turn_secs]
        print(f"\n{mode} ({len(recs)} turns)")
        print(
            f"  end-of-turn -> first audio  p50={percentile(totals, 0.5):.3f}s  "
            f"p95={percentile(totals, 0.95):.3f}s"
        )
        if turn_secs:
            print(
                f"  turn-taking overhead        p50={percentile(turn_secs, 0.5):.3f}s  "
                f"p95={percentile(turn_secs, 0.95):.3f}s"
            )


def plot_breakdown(records: list[SessionTurnRecord], out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(9, 5), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)

    keys_seen: list[str] = []
    for r in records:
        for c in r.breakdown.contributions:
            if c.key not in keys_seen:
                keys_seen.append(c.key)
    ordered_keys = [k for k in KEY_COLORS if k in keys_seen] + [
        k for k in keys_seen if k not in KEY_COLORS
    ]

    x = list(range(1, len(records) + 1))
    bottom = [0.0] * len(records)
    for key in ordered_keys:
        heights = []
        for r in records:
            match = next((c for c in r.breakdown.contributions if c.key == key), None)
            heights.append(match.duration_secs if match else 0.0)
        color = KEY_COLORS.get(key, MUTED)
        ax.bar(x, heights, bottom=bottom, width=0.6, color=color, label=key, linewidth=0)
        bottom = [b + h for b, h in zip(bottom, heights)]

    ax.set_xlabel("Turn", color=INK_SECONDARY)
    ax.set_ylabel("Seconds", color=INK_SECONDARY)
    ax.set_title("Per-turn latency breakdown", color=INK_PRIMARY, loc="left", fontsize=13)
    ax.tick_params(colors=INK_SECONDARY)
    ax.grid(axis="y", color=GRIDLINE, linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.legend(
        loc="upper center",
        bbox_to_anchor=(0.5, -0.15),
        ncol=3,
        frameon=False,
        labelcolor=INK_SECONDARY,
        fontsize=9,
    )

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=150, facecolor=SURFACE)
    print(f"\nWrote {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("patterns", nargs="+", help="glob(s) for session .jsonl files")
    parser.add_argument("--out", default="docs/latency_breakdown.png", type=Path)
    args = parser.parse_args()

    records = load_records(args.patterns)
    if not records:
        print(
            "No records found -- have a few real conversations first (see docs/local-dev-setup.md)."
        )
        return

    print_summary(records)
    plot_breakdown(records, args.out)


if __name__ == "__main__":
    main()
