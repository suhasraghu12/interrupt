"""The turn-taking interface. Every strategy (baseline, semantic) implements this
protocol; the rest of the pipeline only ever talks to a `TurnTakingStrategy`, never to
a concrete strategy class, which is what makes F7 (baseline A/B flag) a config swap.
"""

from dataclasses import dataclass
from enum import Enum, auto
from typing import Protocol


class TurnEvent(Enum):
    USER_SPEECH_START = auto()
    USER_SPEECH_END = auto()  # VAD-reported silence, payload: TickPayload
    PARTIAL_TRANSCRIPT = auto()  # payload: TranscriptPayload
    AGENT_SPEAKING_START = auto()
    AGENT_SPEAKING_END = auto()
    TICK = auto()  # payload: TickPayload -- periodic time check, keeps silence-timeout
    # logic pure/replayable instead of each strategy owning a real timer/thread


class TurnDecision(Enum):
    WAIT = auto()
    RESPOND = auto()
    BARGE_IN_STOP = auto()  # must reach TTS within settings.barge_in_stop_deadline_ms


@dataclass
class TranscriptPayload:
    text: str
    is_final: bool
    timestamp_ms: float


@dataclass
class TickPayload:
    timestamp_ms: float


class TurnTakingStrategy(Protocol):
    def on_event(self, event: TurnEvent, payload: object | None = None) -> TurnDecision | None:
        """Feed one event in. Return a decision if this event changes the turn state,
        else None. Implementations must be side-effect-free beyond internal state --
        no I/O -- so the eval harness can replay events against this method directly.
        """
        ...
