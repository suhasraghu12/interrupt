from app.turn_taking.base import TickPayload, TurnDecision, TurnEvent
from app.turn_taking.baseline import BaselineStrategy


def make_strategy() -> BaselineStrategy:
    return BaselineStrategy(silence_threshold_ms=700)


def test_clean_completion_responds_after_silence_threshold():
    s = make_strategy()
    assert s.on_event(TurnEvent.USER_SPEECH_START) is None
    assert s.on_event(TurnEvent.USER_SPEECH_END, TickPayload(timestamp_ms=1000)) is None

    # Not enough silence yet.
    assert s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=1400)) is None

    # Threshold crossed.
    decision = s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=1700))
    assert decision == TurnDecision.RESPOND

    # Must not fire again on a later tick for the same silence period.
    assert s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=2000)) is None


def test_still_talking_does_not_trigger_premature_respond():
    s = make_strategy()
    s.on_event(TurnEvent.USER_SPEECH_START)
    s.on_event(TurnEvent.USER_SPEECH_END, TickPayload(timestamp_ms=1000))

    # User starts speaking again before the threshold elapses -- resets the timer.
    assert s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=1300)) is None
    s.on_event(TurnEvent.USER_SPEECH_START)
    assert s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=1750)) is None

    s.on_event(TurnEvent.USER_SPEECH_END, TickPayload(timestamp_ms=1800))
    assert s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=2100)) is None
    assert s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=2500)) == TurnDecision.RESPOND


def test_speech_during_playback_triggers_barge_in_stop():
    s = make_strategy()
    s.on_event(TurnEvent.AGENT_SPEAKING_START)

    decision = s.on_event(TurnEvent.USER_SPEECH_START)
    assert decision == TurnDecision.BARGE_IN_STOP

    # Only fires once per playback, even if the user keeps talking.
    s.on_event(TurnEvent.USER_SPEECH_END, TickPayload(timestamp_ms=500))
    assert s.on_event(TurnEvent.USER_SPEECH_START) is None


def test_barge_in_can_fire_again_after_agent_speaks_again():
    s = make_strategy()
    s.on_event(TurnEvent.AGENT_SPEAKING_START)
    assert s.on_event(TurnEvent.USER_SPEECH_START) == TurnDecision.BARGE_IN_STOP

    s.on_event(TurnEvent.AGENT_SPEAKING_END)
    s.on_event(TurnEvent.USER_SPEECH_END, TickPayload(timestamp_ms=500))

    s.on_event(TurnEvent.AGENT_SPEAKING_START)
    assert s.on_event(TurnEvent.USER_SPEECH_START) == TurnDecision.BARGE_IN_STOP


def test_no_response_without_any_speech():
    s = make_strategy()
    assert s.on_event(TurnEvent.TICK, TickPayload(timestamp_ms=5000)) is None
