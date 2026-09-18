"""F7: the naive fixed-silence-threshold strategy. This exists on purpose, as the A/B
comparison point -- it is the "agent stops on every backchannel, waits N ms of VAD
silence with no semantic signal" behavior that the README's results table argues
against. Do not add semantic signals here; that's `semantic.py`.
"""

from app.turn_taking.base import TurnDecision, TurnEvent


class BaselineStrategy:
    def __init__(self, silence_threshold_ms: int = 700):
        self.silence_threshold_ms = silence_threshold_ms
        self._agent_speaking = False

    def on_event(self, event: TurnEvent, payload: object | None = None) -> TurnDecision | None:
        # TODO(week 1): implement fixed-threshold timer -> RESPOND, and
        # any-speech-during-playback -> BARGE_IN_STOP.
        raise NotImplementedError
