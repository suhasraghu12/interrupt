"""LLM provider selection. Local default is Ollama; Groq/Cerebras are the low-TTFT
swap-ins. TTFT dominates perceived latency, so the default targets a small fast model
rather than a smart one.
"""

import json
import urllib.request

from loguru import logger
from pipecat.services.llm_service import LLMService
from pipecat.services.ollama.llm import OLLamaLLMService

from app.config import LlmProvider, Settings


def build_llm_service(settings: Settings) -> LLMService:
    if settings.llm_provider == LlmProvider.LOCAL:
        return OLLamaLLMService(model=settings.ollama_model, base_url=settings.ollama_base_url)

    raise NotImplementedError(
        f"{settings.llm_provider} is not wired yet -- see F11 (pluggable providers)."
    )


def preload(settings: Settings) -> None:
    """Load the model into memory and pin it there before the first turn.

    Warm TTFT is ~100-250ms, but a cold load is ~17s on CPU. Without this the very
    first turn of every session eats that, which would poison the latency numbers and
    make demos look broken.
    """
    if settings.llm_provider != LlmProvider.LOCAL:
        return

    # The native API, not the OpenAI-compatible one build_llm_service uses: keep_alive
    # is an Ollama concept with no OpenAI equivalent.
    native_url = settings.ollama_base_url.removesuffix("/v1").rstrip("/") + "/api/generate"
    request = urllib.request.Request(
        native_url,
        data=json.dumps({"model": settings.ollama_model, "keep_alive": -1}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(request, timeout=120).read()
        logger.info(f"Preloaded {settings.ollama_model}")
    except OSError as e:
        logger.warning(f"Ollama preload failed ({e}) -- first turn will be slow")
