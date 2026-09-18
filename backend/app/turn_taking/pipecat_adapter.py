"""Bridges our pure `TurnTakingStrategy` into Pipecat's turn system.

The split is the point: `TurnTakingStrategy` stays pure event->decision logic with no
timers and no I/O, so `eval/harness.py` can replay recorded scenarios through the exact
same code that runs live. This adapter owns everything impure -- the tick timer, the
async triggers -- and translates Pipecat frames into `TurnEvent`s.

Without this split, the live strategy and the evaluated strategy would be two different
implementations, and the eval numbers wouldn't say anything about the running agent.
"""

import asyncio
import time

from loguru import logger
from pipecat.frames.frames import (
    Frame,
    InterimTranscriptionFrame,
    TranscriptionFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.turns.types import ProcessFrameResult
from pipecat.turns.user_stop import BaseUserTurnStopStrategy

from app.turn_taking.base import (
    TickPayload,
    TranscriptPayload,
    TurnDecision,
    TurnEvent,
    TurnTakingStrategy,
)


class StrategyUserTurnStopStrategy(BaseUserTurnStopStrategy):
    def __init__(
        self,
        *,
        strategy: TurnTakingStrategy,
        tick_interval_ms: int = 50,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._strategy = strategy
        self._tick_interval_s = tick_interval_ms / 1000
        self._tick_task: asyncio.Task | None = None
        self._t0 = time.monotonic()

    def _now_ms(self) -> float:
        return (time.monotonic() - self._t0) * 1000

    async def process_frame(self, frame: Frame) -> ProcessFrameResult:
        if isinstance(frame, VADUserStartedSpeakingFrame):
            self._feed(TurnEvent.USER_SPEECH_START)
        elif isinstance(frame, VADUserStoppedSpeakingFrame):
            self._feed(TurnEvent.USER_SPEECH_END, TickPayload(timestamp_ms=self._now_ms()))
            await self._start_ticking()
        elif isinstance(frame, (TranscriptionFrame, InterimTranscriptionFrame)):
            self._feed(
                TurnEvent.PARTIAL_TRANSCRIPT,
                TranscriptPayload(
                    text=frame.text,
                    is_final=isinstance(frame, TranscriptionFrame),
                    timestamp_ms=self._now_ms(),
                ),
            )
        return ProcessFrameResult.CONTINUE

    def _feed(self, event: TurnEvent, payload: object | None = None) -> TurnDecision | None:
        decision = self._strategy.on_event(event, payload)
        if decision == TurnDecision.BARGE_IN_STOP:
            # Week 4 wires this to actual TTS cancellation. Until then Pipecat's own
            # interruption handling is what stops playback, so log rather than pretend.
            logger.debug(f"{self} BARGE_IN_STOP (not yet wired -- Week 4)")
        return decision

    async def _start_ticking(self) -> None:
        await self._stop_ticking()
        self._tick_task = self.create_task(self._tick_loop())

    async def _stop_ticking(self) -> None:
        if self._tick_task:
            task, self._tick_task = self._tick_task, None
            await self.cancel_task(task)

    async def _tick_loop(self) -> None:
        while True:
            await asyncio.sleep(self._tick_interval_s)
            decision = self._feed(TurnEvent.TICK, TickPayload(timestamp_ms=self._now_ms()))
            if decision == TurnDecision.RESPOND:
                self._tick_task = None  # about to be cancelled by the turn reset
                await self.trigger_user_turn_stopped()
                return

    async def handle_user_turn_started(self) -> None:
        await self._stop_ticking()

    async def handle_user_turn_stopped(self) -> None:
        await self._stop_ticking()
