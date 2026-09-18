"""Central config: provider selection, the baseline/semantic A/B flag, and turn-taking
thresholds. `pipeline.py` is the only module that should read this and wire concrete
instances -- no provider- or strategy-specific branching belongs anywhere else.
"""

from enum import Enum

from pydantic_settings import BaseSettings


class TurnTakingMode(str, Enum):
    BASELINE = "baseline"
    SEMANTIC = "semantic"


class SttProvider(str, Enum):
    FASTER_WHISPER = "faster_whisper"
    DEEPGRAM = "deepgram"
    ASSEMBLYAI = "assemblyai"


class LlmProvider(str, Enum):
    LOCAL = "local"
    GROQ = "groq"
    CEREBRAS = "cerebras"


class TtsProvider(str, Enum):
    PIPER = "piper"
    KOKORO = "kokoro"
    CARTESIA = "cartesia"
    ELEVENLABS = "elevenlabs"


class Settings(BaseSettings):
    # Turn-taking
    turn_taking_mode: TurnTakingMode = TurnTakingMode.BASELINE
    baseline_silence_ms: int = 700
    barge_in_stop_deadline_ms: int = 200

    # Providers -- default to local/self-hosted so the pipeline runs at zero API cost
    stt_provider: SttProvider = SttProvider.FASTER_WHISPER
    llm_provider: LlmProvider = LlmProvider.LOCAL
    tts_provider: TtsProvider = TtsProvider.PIPER

    # LiveKit
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
