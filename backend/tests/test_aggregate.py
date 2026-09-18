from app.config import TurnTakingMode
from app.telemetry import aggregate
from app.telemetry.events import SessionTurnRecord
from app.telemetry.session_recorder import SessionRecorder
from pipecat.observers.user_bot_latency_observer import LatencyBreakdown, LatencyContribution


def contribution(key: str, secs: float) -> LatencyContribution:
    return LatencyContribution(
        key=key, label=key, owner="test", owner_kind="service", start_time=0.0, duration_secs=secs
    )


def record(*contributions: LatencyContribution, user_turn_secs: float | None = None):
    return SessionTurnRecord(
        session_id="s1",
        turn_taking_mode=TurnTakingMode.BASELINE,
        recorded_at=1.0,
        breakdown=LatencyBreakdown(
            total_secs=sum(c.duration_secs for c in contributions),
            contributions=list(contributions),
            user_turn_secs=user_turn_secs,
        ),
    )


def test_contributions_group_into_pipeline_stages():
    view = aggregate.turn_view(
        record(
            contribution("endpointing_wait", 0.1),
            contribution("turn_detection", 0.05),
            contribution("transcription", 0.2),
            contribution("llm_inference", 0.3),
            contribution("speech_synthesis", 0.4),
            contribution("output_transport", 0.01),
        ),
        index=1,
    )

    assert view["stages"]["vad"] == 150.0
    assert view["stages"]["asr"] == 200.0
    assert view["stages"]["llm"] == 300.0
    assert view["stages"]["tts"] == 410.0
    assert view["total_ms"] == 1060.0


def test_connection_setup_is_excluded_from_turn_total():
    """`first_request` spans client_connected to the first request, so on turn 1 it
    carries the whole cold start. Counting it as turn latency would inflate every
    reported number, which is the failure mode ARCHITECTURE.md warns about."""
    view = aggregate.turn_view(
        record(contribution("first_request", 50.0), contribution("llm_inference", 0.3)),
        index=1,
    )

    assert view["total_ms"] == 300.0
    assert view["setup_ms"] == 50000.0
    assert view["stages"]["other"] == 0.0


def test_unrecognised_keys_land_in_other_rather_than_vanishing():
    view = aggregate.turn_view(record(contribution("some_future_pipecat_key", 0.25)), index=1)

    assert view["stages"]["other"] == 250.0
    assert view["total_ms"] == 250.0


def test_mode_summaries_report_per_arm_percentiles(tmp_path):
    for mode, secs in ((TurnTakingMode.BASELINE, [0.4, 0.6]), (TurnTakingMode.SEMANTIC, [0.2])):
        recorder = SessionRecorder(f"sess-{mode}", mode, out_dir=tmp_path)
        for s in secs:
            r = record(contribution("llm_inference", s))
            recorder.record(r.model_copy(update={"turn_taking_mode": mode}))

    summaries = {s["turn_taking_mode"]: s for s in aggregate.mode_summaries(tmp_path)}

    assert summaries["baseline"]["turns"] == 2
    assert summaries["baseline"]["p50_ms"] == 500.0
    assert summaries["semantic"]["turns"] == 1
    assert summaries["semantic"]["mean_ms"] == 200.0


def test_mode_summaries_omit_arms_with_no_recordings(tmp_path):
    recorder = SessionRecorder("sess-a", TurnTakingMode.BASELINE, out_dir=tmp_path)
    recorder.record(record(contribution("llm_inference", 0.3)))

    modes = {s["turn_taking_mode"] for s in aggregate.mode_summaries(tmp_path)}

    # An arm that was never run must be absent, not zero -- the benchmark view
    # distinguishes "not run yet" from "ran and scored badly".
    assert modes == {"baseline"}


def test_histogram_buckets_scale_to_the_data():
    fast = aggregate.histogram([320.0, 360.0, 434.0])
    slow = aggregate.histogram([8721.0])

    assert fast[0]["label"] == "0-100"
    assert slow[0]["label"] == "0-2000"
    assert sum(b["count"] for b in slow) == 1
