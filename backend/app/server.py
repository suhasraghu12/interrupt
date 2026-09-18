"""FastAPI app: LiveKit room-token issuance for the frontend, health check, and a
read-only endpoint exposing the active config (so a demo can show which turn-taking
mode / providers are running).
"""

from fastapi import FastAPI
from livekit import api

from app.config import Settings, settings

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


def mint_token(settings: Settings, room: str, identity: str) -> str:
    return (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )


@app.post("/token")
def issue_token(room: str, identity: str) -> dict:
    return {"token": mint_token(settings, room, identity), "url": settings.livekit_url}
