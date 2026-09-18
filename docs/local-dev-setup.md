# Local dev setup

Everything below runs locally with no paid API keys. Four processes: LiveKit server,
Ollama, the backend (FastAPI + agent worker), and the frontend dev server.

## 1. LiveKit server

The `infra/docker-compose.yml` path works if you have Docker. If you don't (Windows
without Docker Desktop, for example), LiveKit ships a standalone binary:

1. Download the Windows build from https://github.com/livekit/livekit/releases
   (`livekit_<version>_windows_amd64.zip`) and extract `livekit-server.exe` somewhere
   on your PATH.
2. Run it in dev mode:

   ```
   livekit-server --dev
   ```

Dev mode listens on `ws://localhost:7880` with the well-known dev credentials
(`devkey` / `secret`) that `.env.example` already points at. Never use these outside
local dev.

## 2. Ollama

```
ollama serve          # skip if it already runs as a background service
ollama pull llama3.2:1b
```

The small model is deliberate — TTFT dominates perceived latency, so the default
config targets a fast model rather than a smart one.

## 3. Backend

```
python -m pip install -e ".[dev]"
copy .env.example .env

uvicorn app.server:app --reload --app-dir backend   # token issuance on :8000
python -m app.main                                   # agent worker, joins the room
```

The agent worker downloads the Whisper and Piper voice models on first run, so the
first start is slow.

## 4. Frontend

```
cd frontend
npm install
npm run dev
```

Open the printed URL, click Connect, and allow microphone access.

## Notes

- Piper TTS runs in-process via the GPL-3.0 `piper-tts` package. It's pulled in through
  the `pipecat-ai[piper]` extra; swap `TTS_PROVIDER` if that licensing matters for your
  use of this repo.
- `faster-whisper` transcribes per utterance after VAD reports speech-end — it does not
  emit true incremental partials. That's fine for the baseline strategy, but semantic
  end-of-utterance work will need a streaming-capable STT provider.
