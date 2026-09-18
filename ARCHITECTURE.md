# Architecture — Interrupt

A cascade-pipeline voice agent whose distinguishing contribution is an explicit, measurable turn-taking module, benchmarked against a fixed-silence-threshold baseline.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Transport | LiveKit (self-hostable) | Native Pipecat integration, avoids per-minute hosted cost during iteration |
| Orchestration | Pipecat | Streaming pipeline abstraction for VAD/STT/LLM/TTS |
| VAD | Silero VAD | CPU, ~1ms/chunk |
| STT | faster-whisper (default) / Deepgram, AssemblyAI (swappable) | Local-first, zero cost during dev |
| LLM | local/cheap-fast model (default) / Groq, Cerebras (swappable) | TTFT dominates perceived latency |
| TTS | Piper / Kokoro (default) / Cartesia, ElevenLabs (swappable) | Local-first, zero cost during dev |
| Frontend | React + Vite + livekit-client | Mic capture, playback, live transcript, latency dashboard |
| Backend | Python (FastAPI + Pipecat) | |
| Tracing | OpenTelemetry → Langfuse | Per-turn latency breakdown |

## Repo layout

```
interrupt/
├── README.md
├── ARCHITECTURE.md
├── pyproject.toml
├── backend/
│   └── app/
│       ├── main.py              # LiveKit room entrypoint / agent worker
│       ├── config.py            # provider selection, baseline flag, thresholds
│       ├── pipeline.py          # builds the Pipecat pipeline from config
│       ├── turn_taking/
│       │   ├── base.py          # TurnTakingStrategy protocol
│       │   ├── baseline.py      # fixed-silence-threshold strategy (F7)
│       │   ├── semantic.py      # VAD + semantic EOU strategy (F4)
│       │   └── backchannel.py   # backchannel classifier (F8)
│       ├── providers/
│       │   ├── vad.py
│       │   ├── stt.py
│       │   ├── llm.py
│       │   └── tts.py
│       ├── telemetry/
│       │   ├── events.py        # turn event schema
│       │   ├── tracer.py        # OpenTelemetry → Langfuse
│       │   └── session_recorder.py  # raw audio + event trace dump per session
│       └── server.py            # FastAPI: token issuance, health, config
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── CallView.tsx
│       │   ├── TranscriptPanel.tsx
│       │   └── LatencyDashboard.tsx
│       └── lib/livekit-client.ts
├── eval/
│   ├── scenarios/                # recorded audio + labels (F9)
│   ├── harness.py                # replay scenarios against turn_taking module directly
│   └── report.py                 # false-interruption / missed-turn / backchannel rates
└── infra/
    └── docker-compose.yml        # self-hosted LiveKit (+ optional local Langfuse)
```

`turn_taking/` and `providers/` are deliberately separate: turn-taking logic never knows which STT/TTS vendor is active, only that it receives VAD events and a transcript stream and emits turn decisions. That separation is what makes both the baseline A/B flag (F7) and provider swapping (F11) a config change rather than a code change.

## Core interface

```python
class TurnEvent(Enum):
    USER_SPEECH_START = auto()
    USER_SPEECH_END = auto()       # VAD-only silence
    PARTIAL_TRANSCRIPT = auto()    # carries (text, is_final)
    AGENT_SPEAKING_START = auto()
    AGENT_SPEAKING_END = auto()

class TurnDecision(Enum):
    WAIT = auto()
    RESPOND = auto()
    BARGE_IN_STOP = auto()         # must reach TTS within 200ms

class TurnTakingStrategy(Protocol):
    def on_event(self, event: TurnEvent, payload: Any) -> TurnDecision | None: ...
```

- **`BaselineStrategy`** — `RESPOND` after N ms of VAD silence, no semantic signal; `BARGE_IN_STOP` on any speech detected during playback. This is the literal implementation of the naive approach the README's results table argues against (100% backchannel false-stop rate).
- **`SemanticStrategy`** — combines VAD silence with a semantic end-of-utterance signal (classifier or prompted fast LLM against the partial transcript) before allowing `RESPOND`. Which EOU approach ships is a week-3 decision (latency vs. accuracy prototype per the PRD's open questions); the interface is unaffected either way.
- **Backchannel detection (F8)** is a filter in front of `BARGE_IN_STOP`, not folded into VAD or STT, so it can be tested and tuned in isolation — and so it can consult either VAD-timing heuristics or transcript word-matching (or both) without touching the rest of the pipeline.

Provider interfaces (`providers/*.py`) are small protocols (`transcribe_stream`, `generate_stream`, `synthesize_stream`); local and paid implementations are interchangeable purely via `config.py`.

## Data flow

```
Browser mic → LiveKit room → Pipecat pipeline:
  AudioFrame → VAD processor ─┬─→ TurnTakingStrategy ←── STT partials
                               │         │
                               │         ├─ WAIT / RESPOND / BARGE_IN_STOP
                               │         ▼
                        LLM (streaming) → TTS (streaming) → LiveKit → Browser playback
```

Every stage timestamps events through `telemetry/events.py`. `session_recorder.py` persists raw audio plus the full event trace per session to disk, so timing-dependent bugs can be replayed offline instead of chased live. The eval harness (`eval/harness.py`) drives `TurnTakingStrategy` directly against recorded scenarios — no LiveKit, no audio I/O, no API cost — for fast iteration on turn-taking accuracy.

## Config

A single `TURN_TAKING_STRATEGY=baseline|semantic` setting selects F7's A/B flag; `STT_PROVIDER` / `LLM_PROVIDER` / `TTS_PROVIDER` select implementations. Defaults are the local/self-hosted providers so the pipeline runs at zero API cost out of the box. `pipeline.py` is the only place that reads config and wires concrete instances — no provider- or strategy-specific branching anywhere else.
