from app.config import TurnTakingMode
from app.telemetry.events import SessionTurnRecord
from app.telemetry.session_recorder import SessionRecorder
from pipecat.observers.user_bot_latency_observer import LatencyBreakdown


def test_record_round_trips_through_jsonl(tmp_path):
    recorder = SessionRecorder("sess123", TurnTakingMode.BASELINE, out_dir=tmp_path)
    record = SessionTurnRecord(
        session_id="sess123",
        turn_taking_mode=TurnTakingMode.BASELINE,
        recorded_at=1234.5,
        breakdown=LatencyBreakdown(total_secs=0.42),
    )

    recorder.record(record)
    recorder.record(record)

    assert recorder.path.name == "sess123_baseline.jsonl"
    lines = recorder.path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2

    loaded = SessionTurnRecord.model_validate_json(lines[0])
    assert loaded.session_id == "sess123"
    assert loaded.turn_taking_mode == TurnTakingMode.BASELINE
    assert loaded.breakdown.total_secs == 0.42
