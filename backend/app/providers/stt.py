"""STT provider interface (F3: streaming partial transcripts) plus implementations.
Default is faster-whisper (local, zero API cost); Deepgram/AssemblyAI are the paid
swap-ins selected via config.stt_provider. Nothing outside this module should import
a vendor SDK directly.
"""

from typing import AsyncIterator, Protocol


class SttStream(Protocol):
    async def transcribe_stream(self, audio_chunks: AsyncIterator[bytes]) -> AsyncIterator[str]:
        """Yields partial transcript text as audio arrives."""
        ...


class FasterWhisperStt:
    def __init__(self, model_size: str = "small.en"):
        # TODO(week 1): load faster-whisper model.
        raise NotImplementedError

    async def transcribe_stream(self, audio_chunks: AsyncIterator[bytes]) -> AsyncIterator[str]:
        raise NotImplementedError
        yield  # pragma: no cover


class DeepgramStt:
    def __init__(self, api_key: str):
        # TODO: comparison-provider, add when F11 is scoped.
        raise NotImplementedError

    async def transcribe_stream(self, audio_chunks: AsyncIterator[bytes]) -> AsyncIterator[str]:
        raise NotImplementedError
        yield  # pragma: no cover
