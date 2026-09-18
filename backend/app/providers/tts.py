"""TTS provider interface plus implementations. Default is Piper/Kokoro (local, zero
API cost); Cartesia/ElevenLabs are the low-latency paid swap-ins selected via
config.tts_provider. Must support mid-stream cancellation -- barge-in (F5) requires
stopping playback within 200ms, which means the synthesis stream itself has to be
interruptible, not just the audio player on the client.
"""

from typing import AsyncIterator, Protocol


class TtsStream(Protocol):
    async def synthesize_stream(self, text_chunks: AsyncIterator[str]) -> AsyncIterator[bytes]:
        """Yields audio bytes incrementally as text arrives."""
        ...

    async def stop(self) -> None:
        """Cancel in-flight synthesis immediately. Called on BARGE_IN_STOP."""
        ...


class PiperTts:
    def __init__(self, voice: str):
        # TODO(week 1): wire Piper (or Kokoro) local TTS.
        raise NotImplementedError

    async def synthesize_stream(self, text_chunks: AsyncIterator[str]) -> AsyncIterator[bytes]:
        raise NotImplementedError
        yield  # pragma: no cover

    async def stop(self) -> None:
        raise NotImplementedError


class CartesiaTts:
    def __init__(self, api_key: str, voice: str):
        # TODO: comparison-provider, add when F11 is scoped.
        raise NotImplementedError

    async def synthesize_stream(self, text_chunks: AsyncIterator[str]) -> AsyncIterator[bytes]:
        raise NotImplementedError
        yield  # pragma: no cover

    async def stop(self) -> None:
        raise NotImplementedError
