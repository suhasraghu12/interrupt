"""FastAPI app: LiveKit room-token issuance for the frontend, health check, and a
read-only endpoint exposing the active config (useful for the frontend to display
which turn-taking mode / providers are active during a demo).
"""

from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="Interrupt")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/config")
def get_config() -> dict:
    return {
        "turn_taking_mode": settings.turn_taking_mode,
        "stt_provider": settings.stt_provider,
        "llm_provider": settings.llm_provider,
        "tts_provider": settings.tts_provider,
    }


@app.post("/token")
def issue_token(room: str, identity: str) -> dict:
    # TODO(week 1): mint a LiveKit access token via livekit-api.
    raise NotImplementedError
