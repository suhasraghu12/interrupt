"""LLM provider interface plus implementations. Default is a local/cheap-fast model
(zero API cost); Groq/Cerebras are the low-TTFT paid swap-ins selected via
config.llm_provider. TTFT dominates perceived end-to-end latency (PRD F6/F10), so
whatever is used here must stream tokens, not just stream the final response.
"""

from typing import AsyncIterator, Protocol


class LlmStream(Protocol):
    async def generate_stream(self, prompt: str) -> AsyncIterator[str]:
        """Yields response text incrementally."""
        ...


class LocalLlm:
    def __init__(self, model: str):
        # TODO(week 1): wire a local fast model (e.g. via Ollama or llama.cpp).
        raise NotImplementedError

    async def generate_stream(self, prompt: str) -> AsyncIterator[str]:
        raise NotImplementedError
        yield  # pragma: no cover


class GroqLlm:
    def __init__(self, api_key: str, model: str):
        # TODO: comparison-provider, add when F11 is scoped.
        raise NotImplementedError

    async def generate_stream(self, prompt: str) -> AsyncIterator[str]:
        raise NotImplementedError
        yield  # pragma: no cover
