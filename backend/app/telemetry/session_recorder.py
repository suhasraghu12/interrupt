"""Persists per-turn latency breakdowns to disk as JSONL, one file per session, so
`scripts/latency_report.py` can compute p50/p95 numbers and a breakdown chart after
the fact without needing a live pipeline.

Raw-audio session recording (the other half of PRD Sec.11's replay-offline risk
mitigation) is not implemented here -- that needs LiveKit track recording/egress and
isn't required for the Week 2 latency-chart milestone. Documented gap, not a silent
drop.
"""

from pathlib import Path

from app.config import TurnTakingMode
from app.telemetry.events import SessionTurnRecord

DEFAULT_SESSIONS_DIR = Path(__file__).parent.parent.parent.parent / "sessions"


class SessionRecorder:
    def __init__(
        self,
        session_id: str,
        turn_taking_mode: TurnTakingMode,
        out_dir: Path = DEFAULT_SESSIONS_DIR,
    ):
        out_dir.mkdir(parents=True, exist_ok=True)
        self.path = out_dir / f"{session_id}_{turn_taking_mode}.jsonl"

    def record(self, record: SessionTurnRecord) -> None:
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(record.model_dump_json())
            f.write("\n")
