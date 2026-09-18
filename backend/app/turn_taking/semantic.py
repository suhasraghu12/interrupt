"""F4: VAD silence + semantic end-of-utterance signal, combined, before allowing
RESPOND. Which EOU approach ships (small classifier vs. prompted fast LLM against the
partial transcript) is a week-3 decision per the PRD's open questions -- prototype
both against the eval harness and pick on latency-vs-accuracy. This interface does not
change either way.
"""

from app.turn_taking.base import TurnDecision, TurnEvent


class SemanticStrategy:
    def __init__(self, silence_threshold_ms: int = 700):
        self.silence_threshold_ms = silence_threshold_ms

    def on_event(self, event: TurnEvent, payload: object | None = None) -> TurnDecision | None:
        # TODO(week 3): VAD silence AND semantic EOU signal both required before RESPOND.
        raise NotImplementedError
