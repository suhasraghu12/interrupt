"""F7: the naive fixed-silence-threshold strategy. This exists on purpose, as the A/B
comparison point -- it is the "agent stops on every backchannel, waits N ms of VAD
silence with no semantic signal" behavior that the README's results table argues
against. Do not add semantic signals here; that's `semantic.py`.
"""

from app.turn_taking.base import TickPayload, TurnDecision, TurnEvent


class BaselineStrategy:
    def __init__(self, silence_threshold_ms: int = 700):
        self.silence_threshold_ms = silence_threshold_ms
        self._user_speaking = False
        self._agent_speaking = False
        self._last_speech_end_ms: float | None = None
        self._responded_for_silence = False
        self._barge_in_issued = False

    def on_event(self, event: TurnEvent, payload: object | None = None) -> TurnDecision | None:
        if event == TurnEvent.USER_SPEECH_START:
            self._user_speaking = True
            self._last_speech_end_ms = None
            self._responded_for_silence = False
            if self._agent_speaking and not self._barge_in_issued:
                self._barge_in_issued = True
                return TurnDecision.BARGE_IN_STOP
            return None

        if event == TurnEvent.USER_SPEECH_END:
            self._user_speaking = False
            assert isinstance(payload, TickPayload)
            self._last_speech_end_ms = payload.timestamp_ms
            self._responded_for_silence = False
            return None

        if event == TurnEvent.TICK:
            assert isinstance(payload, TickPayload)
            if (
                not self._user_speaking
                and not self._agent_speaking
                and not self._responded_for_silence
                and self._last_speech_end_ms is not None
                and payload.timestamp_ms - self._last_speech_end_ms >= self.silence_threshold_ms
            ):
                self._responded_for_silence = True
                return TurnDecision.RESPOND
            return None

        if event == TurnEvent.AGENT_SPEAKING_START:
            self._agent_speaking = True
            self._barge_in_issued = False
            return None

        if event == TurnEvent.AGENT_SPEAKING_END:
            self._agent_speaking = False
            self._barge_in_issued = False
            return None

        # PARTIAL_TRANSCRIPT: the baseline has no semantic signal, ignore it.
        return None
