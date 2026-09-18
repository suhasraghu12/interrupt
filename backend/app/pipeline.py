"""Builds the Pipecat pipeline from config.Settings. This is the only module that
should branch on turn_taking_mode / stt_provider / llm_provider / tts_provider --
everywhere else talks to the Protocol interfaces only.
"""

from app.config import Settings
from app.turn_taking.base import TurnTakingStrategy


def build_turn_taking_strategy(settings: Settings) -> TurnTakingStrategy:
    from app.config import TurnTakingMode

    if settings.turn_taking_mode == TurnTakingMode.BASELINE:
        from app.turn_taking.baseline import BaselineStrategy

        return BaselineStrategy(silence_threshold_ms=settings.baseline_silence_ms)

    from app.turn_taking.semantic import SemanticStrategy

    return SemanticStrategy(silence_threshold_ms=settings.baseline_silence_ms)


def build_pipeline(settings: Settings):
    # TODO(week 1): wire VAD -> STT -> TurnTakingStrategy -> LLM -> TTS into a Pipecat
    # Pipeline using the provider instances selected by settings.*_provider.
    raise NotImplementedError
