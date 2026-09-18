"""Central config: provider selection, the baseline/semantic A/B flag, and turn-taking
thresholds. `pipeline.py` is the only module that should read this and wire concrete
instances -- no provider- or strategy-specific branching belongs anywhere else.
"""

from enum import StrEnum

from pydantic_settings import BaseSettings


class TurnTakingMode(StrEnum):
    """The three arms of the A/B (F7).

    BASELINE and SEMANTIC are our own strategies, implemented as pure event->decision
    logic so the eval harness can replay them offline. SMART_TURN is Pipecat's built-in
    LocalSmartTurnAnalyzerV3 -- the framework's own semantic end-of-utterance model,
    included as the arm to beat. "Better than naive" is a weak claim on its own; "better
    than the framework default" is the one worth publishing.
    """

    BASELINE = "baseline"
    SMART_TURN = "smart_turn"
    SEMANTIC = "semantic"


class SttProvider(StrEnum):
    FASTER_WHISPER = "faster_whisper"
    DEEPGRAM = "deepgram"
    ASSEMBLYAI = "assemblyai"


class LlmProvider(StrEnum):
    LOCAL = "local"
    GROQ = "groq"
    CEREBRAS = "cerebras"


class TtsProvider(StrEnum):
    PIPER = "piper"
    KOKORO = "kokoro"
    CARTESIA = "cartesia"
    ELEVENLABS = "elevenlabs"


class Settings(BaseSettings):
    # Turn-taking
    turn_taking_mode: TurnTakingMode = TurnTakingMode.BASELINE
    baseline_silence_ms: int = 700
    barge_in_stop_deadline_ms: int = 200
    turn_tick_interval_ms: int = 50  # how often silence-timeout logic is re-evaluated

    # Providers -- default to local/self-hosted so the pipeline runs at zero API cost
    stt_provider: SttProvider = SttProvider.FASTER_WHISPER
    llm_provider: LlmProvider = LlmProvider.LOCAL
    tts_provider: TtsProvider = TtsProvider.PIPER

    # Provider models
    whisper_model: str = "small.en"
    ollama_model: str = "llama3.2:1b"
    ollama_base_url: str = "http://localhost:11434/v1"
    piper_voice: str = "en_US-lessac-medium"

    # LiveKit
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"
    livekit_room: str = "interrupt"

    class Config:
        env_file = ".env"


settings = Settings()
