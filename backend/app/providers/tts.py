"""TTS provider selection. Local default is Piper (in-process, GPL-3.0 -- see
docs/local-dev-setup.md); Cartesia/ElevenLabs are the low-latency swap-ins.

Barge-in (F5) needs synthesis to be cancellable mid-stream, not just the client-side
player to stop. Pipecat's TTSService handles cancellation on interruption; Week 4 work
is about *deciding* when to cancel, not about the mechanism.
"""

from pipecat.services.piper.tts import PiperTTSService
from pipecat.services.tts_service import TTSService

from app.config import Settings, TtsProvider


def build_tts_service(settings: Settings) -> TTSService:
    if settings.tts_provider == TtsProvider.PIPER:
        return PiperTTSService(voice_id=settings.piper_voice)

    raise NotImplementedError(
        f"{settings.tts_provider} is not wired yet -- see F11 (pluggable providers)."
    )
