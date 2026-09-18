"""Builds the Pipecat pipeline from config.Settings. This is the only module that
should branch on turn_taking_mode / stt_provider / llm_provider / tts_provider --
everywhere else talks to the interfaces only.
"""

import time
import uuid

from loguru import logger
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.observers.user_bot_latency_observer import LatencyBreakdown, UserBotLatencyObserver
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.transports.livekit.transport import LiveKitParams, LiveKitTransport
from pipecat.turns.user_stop import BaseUserTurnStopStrategy
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import (
    TurnAnalyzerUserTurnStopStrategy,
)
from pipecat.turns.user_turn_strategies import UserTurnStrategies

from app.config import Settings, TurnTakingMode
from app.providers.llm import build_llm_service
from app.providers.stt import build_stt_service
from app.providers.tts import build_tts_service
from app.providers.vad import build_vad_analyzer
from app.telemetry.events import SessionTurnRecord
from app.telemetry.session_recorder import SessionRecorder
from app.turn_taking.base import TurnTakingStrategy
from app.turn_taking.pipecat_adapter import StrategyUserTurnStopStrategy

SYSTEM_PROMPT = (
    "You are a voice assistant. Keep replies to one or two short sentences. "
    "Your output is spoken aloud, so use plain words and no formatting."
)


def build_strategy(settings: Settings) -> TurnTakingStrategy:
    """The pure, replayable half of the turn decision -- shared by the live pipeline and
    the eval harness. SMART_TURN has no equivalent here: it's a Pipecat-internal audio
    model, evaluated live rather than replayed.
    """
    if settings.turn_taking_mode == TurnTakingMode.BASELINE:
        from app.turn_taking.baseline import BaselineStrategy

        return BaselineStrategy(silence_threshold_ms=settings.baseline_silence_ms)

    from app.turn_taking.semantic import SemanticStrategy

    return SemanticStrategy(silence_threshold_ms=settings.baseline_silence_ms)


def build_stop_strategy(settings: Settings) -> BaseUserTurnStopStrategy:
    if settings.turn_taking_mode == TurnTakingMode.SMART_TURN:
        # The arm to beat: Pipecat's own semantic end-of-utterance model.
        return TurnAnalyzerUserTurnStopStrategy(turn_analyzer=LocalSmartTurnAnalyzerV3())

    return StrategyUserTurnStopStrategy(
        strategy=build_strategy(settings),
        tick_interval_ms=settings.turn_tick_interval_ms,
    )


def build_latency_observer(settings: Settings, session_id: str) -> UserBotLatencyObserver:
    """F6: per-turn latency breakdown, via Pipecat's own observer (see
    telemetry/events.py for why this isn't reimplemented). Persists each turn to
    sessions/<session_id>_<mode>.jsonl for scripts/latency_report.py to analyze.
    """
    recorder = SessionRecorder(session_id, settings.turn_taking_mode)
    observer = UserBotLatencyObserver()

    @observer.event_handler("on_latency_breakdown")
    async def _on_latency_breakdown(_observer: UserBotLatencyObserver, breakdown: LatencyBreakdown):
        recorder.record(
            SessionTurnRecord(
                session_id=session_id,
                turn_taking_mode=settings.turn_taking_mode,
                recorded_at=time.time(),
                breakdown=breakdown,
            )
        )

    logger.info(f"Latency log: {recorder.path}")
    return observer


def build_pipeline(settings: Settings, token: str) -> PipelineTask:
    session_id = uuid.uuid4().hex[:12]
    transport = LiveKitTransport(
        url=settings.livekit_url,
        token=token,
        room_name=settings.livekit_room,
        params=LiveKitParams(audio_in_enabled=True, audio_out_enabled=True),
    )

    context = LLMContext([{"role": "system", "content": SYSTEM_PROMPT}])
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=build_vad_analyzer(settings),
            user_turn_strategies=UserTurnStrategies(stop=[build_stop_strategy(settings)]),
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            build_stt_service(settings),
            aggregators.user(),
            build_llm_service(settings),
            build_tts_service(settings),
            transport.output(),
            aggregators.assistant(),
        ]
    )

    return PipelineTask(
        pipeline,
        params=PipelineParams(enable_metrics=True),
        observers=[build_latency_observer(settings, session_id)],
    )
