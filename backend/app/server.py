"""FastAPI app: LiveKit room-token issuance for the frontend, health check, a read-only
endpoint exposing the active config, and the recorded-telemetry endpoints the frontend's
latency and benchmark views read from.

Live per-turn events (transcripts, turn decisions) do not come through here -- the agent
publishes those straight into the LiveKit room as data messages, so they reach the
browser without a round-trip through this process. See telemetry/turn_publisher.py.
"""

from fastapi import FastAPI, HTTPException
from livekit import api

from app.config import Settings, settings
from app.telemetry import aggregate

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
        "baseline_silence_ms": settings.baseline_silence_ms,
        "barge_in_stop_deadline_ms": settings.barge_in_stop_deadline_ms,
        "turn_tick_interval_ms": settings.turn_tick_interval_ms,
        "whisper_model": settings.whisper_model,
        "ollama_model": settings.ollama_model,
        "piper_voice": settings.piper_voice,
    }


@app.get("/sessions")
def list_sessions() -> list[dict]:
    """Recorded sessions, newest first. One file per session, written by SessionRecorder."""
    return [aggregate.session_summary(path) for path in aggregate.session_files()]


@app.get("/sessions/{session_id}/turns")
def get_session_turns(session_id: str) -> dict:
    """Per-turn stage breakdown for one recorded session — the waterfall's rows."""
    for path in aggregate.session_files():
        match = aggregate.SESSION_FILENAME.match(path.name)
        if match and match["session_id"] == session_id:
            records = aggregate.load_file(path)
            turns = [aggregate.turn_view(r, i) for i, r in enumerate(records, start=1)]
            return {
                "session_id": session_id,
                "turn_taking_mode": match["mode"],
                "turns": turns,
                "histogram": aggregate.histogram([t["total_ms"] for t in turns]),
            }
    raise HTTPException(status_code=404, detail=f"no recorded session {session_id!r}")


@app.get("/latency/summary")
def latency_summary() -> dict:
    """Per-A/B-arm latency across every recorded session, plus the pooled distribution.

    Arms with no recorded turns are absent from `modes` rather than zeroed, so a caller
    can distinguish "not run yet" from "ran and scored badly".
    """
    modes = aggregate.mode_summaries()
    paths = aggregate.session_files()
    totals = [
        aggregate.turn_view(r, i)["total_ms"]
        for path in paths
        for i, r in enumerate(aggregate.load_file(path), start=1)
    ]
    return {
        "modes": modes,
        "total_turns": len(totals),
        "histogram": aggregate.histogram(totals),
        "p50_ms": round(aggregate.percentile(totals, 0.5) or 0, 1) if totals else None,
        "p90_ms": round(aggregate.percentile(totals, 0.9) or 0, 1) if totals else None,
        "p95_ms": round(aggregate.percentile(totals, 0.95) or 0, 1) if totals else None,
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
