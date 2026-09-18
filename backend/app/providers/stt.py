"""STT provider selection (F3). Local default is faster-whisper via Pipecat's
WhisperSTTService; Deepgram/AssemblyAI are the streaming swap-ins.

Note: faster-whisper transcribes per utterance after VAD reports speech-end -- it does
not emit true incremental partials. The baseline strategy doesn't need them, but
semantic end-of-utterance work does, which is why the streaming providers exist here.
"""

from pipecat.services.stt_service import STTService
from pipecat.services.whisper.stt import WhisperSTTService

from app.config import Settings, SttProvider


def build_stt_service(settings: Settings) -> STTService:
    if settings.stt_provider == SttProvider.FASTER_WHISPER:
        return WhisperSTTService(model=settings.whisper_model)

    raise NotImplementedError(
        f"{settings.stt_provider} is not wired yet -- see F11 (pluggable providers)."
    )
