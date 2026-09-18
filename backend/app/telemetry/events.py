"""Turn event schema (F6). Every pipeline stage timestamps into this so a per-turn
latency breakdown (VAD -> STT final -> turn decision -> LLM TTFT -> TTS first byte ->
audio out) can be reconstructed after the fact, live in a dashboard (F10), or replayed
from a session recording (see session_recorder.py).
"""

from enum import Enum
from pydantic import BaseModel


class Stage(str, Enum):
    VAD_SPEECH_END = "vad_speech_end"
    STT_FINAL_TRANSCRIPT = "stt_final_transcript"
    TURN_DECISION = "turn_decision"
    LLM_FIRST_TOKEN = "llm_first_token"
    TTS_FIRST_BYTE = "tts_first_byte"
    AUDIO_OUT_START = "audio_out_start"
    BARGE_IN_DETECTED = "barge_in_detected"
    BARGE_IN_STOPPED = "barge_in_stopped"


class TurnStageEvent(BaseModel):
    session_id: str
    turn_id: str
    stage: Stage
    t_ms: float  # monotonic ms since session start
    meta: dict = {}
