"""Persistence record for F6 (per-turn latency breakdown).

Pipecat's own UserBotLatencyObserver (pipecat.observers.user_bot_latency_observer)
already produces the per-turn breakdown this needs: per-service TTFB, named
contributions that sum to the total (including parts no service measures, like VAD
silence wait), and `user_turn_secs` -- the time the turn-taking strategy itself adds,
isolated from STT/LLM/TTS. Reimplementing that would just be a worse copy of it.

The only thing our code adds on top is which session and which A/B arm a breakdown
belongs to, so later multi-mode comparisons can group by turn_taking_mode.
"""

from pipecat.observers.user_bot_latency_observer import LatencyBreakdown
from pydantic import BaseModel


class SessionTurnRecord(BaseModel):
    session_id: str
    turn_taking_mode: str
    recorded_at: float  # unix timestamp
    breakdown: LatencyBreakdown
