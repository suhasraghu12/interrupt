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
| Frontend | React + Vite + Tailwind + livekit-client | Mic capture, playback, live transcript, latency dashboard |
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
│       │   ├── events.py        # SessionTurnRecord (wraps Pipecat's LatencyBreakdown)
│       │   ├── tracer.py        # OpenTelemetry → Langfuse (later)
│       │   ├── session_recorder.py  # JSONL: one LatencyBreakdown per turn
│       │   ├── aggregate.py     # stage grouping + percentiles, shared by API and report
│       │   └── turn_publisher.py    # live turn events → LiveKit room data messages
│       └── server.py            # FastAPI: token, health, config, recorded telemetry
├── frontend/
│   ├── tailwind.config.js        # design tokens (Stitch-generated; source design not tracked)
│   └── src/
│       ├── App.tsx               # routes: one per research view
│       ├── components/
│       │   ├── AppShell.tsx      # instrument header + left rail, shared by all views
│       │   ├── ui.tsx            # panel/metric/label primitives
│       │   ├── CallView.tsx      # live stage, dual-channel scope, engine config
│       │   ├── TranscriptPanel.tsx    # turn stream + per-turn inspector
│       │   ├── LatencyDashboard.tsx   # waterfall + distribution
│       │   └── BenchmarkPanel.tsx     # three-arm comparison
│       └── lib/
│           ├── livekit-client.ts
│           ├── session.tsx       # room state, mic/agent RMS, /config, live turn events
│           ├── api.ts            # typed reads of the recorded-telemetry endpoints
│           └── arms.ts           # what each A/B arm is (descriptions, not results)
├── eval/
│   ├── scenarios/                # recorded audio + labels (F9)
│   ├── harness.py                # replay scenarios against turn_taking module directly
│   └── report.py                 # false-interruption / missed-turn / backchannel rates
└── infra/
    └── docker-compose.yml        # self-hosted LiveKit (+ optional local Langfuse)
```

`turn_taking/` and `providers/` are deliberately separate: turn-taking logic never knows which STT/TTS vendor is active, only that it receives VAD events and a transcript stream and emits turn decisions. That separation is what makes both the baseline A/B flag (F7) and provider swapping (F11) a config change rather than a code change.

The frontend is four views over one session, and every number in it comes from the backend. Two different paths get it there, because they answer different questions:

- **Live, during a call** — the agent publishes turn events (speech boundaries, partial and final transcripts, interruptions) straight into the LiveKit room as data messages (`telemetry/turn_publisher.py`). The browser is already joined to that room, so this needs no IPC between the agent worker and the API server and no polling. The transcript view is empty until a call runs; it never falls back to fixtures.
- **After the fact, from disk** — `GET /sessions`, `/sessions/{id}/turns` and `/latency/summary` read the recorded JSONL through `telemetry/aggregate.py`. The waterfall and benchmark views read these.

`aggregate.py` owns the mapping from Pipecat's contribution keys to the four pipeline stages the chart shows, so `scripts/latency_report.py` and the API can never disagree about what counts as "ASR". It also holds `first_request` out of per-turn totals: that contribution runs from `client_connected` to the first request, so on turn 1 it carries the entire cold start — tens of seconds locally. Folding it into turn latency would inflate every published number, which is exactly the failure this document's measurement section warns about, so it is reported separately as setup and pinned by a test.

What the frontend cannot show, it names instead of faking. The benchmark view's accuracy columns (false interruption, missed turn, backchannel false-stop) stay empty until `eval/harness.py` replays a labelled scenario set; an A/B arm with no recorded sessions reads "not run" rather than zero, so a missing arm is never mistaken for a bad one.

## Core interface

```python
class TurnEvent(Enum):
    USER_SPEECH_START = auto()
    USER_SPEECH_END = auto()       # VAD-only silence
    PARTIAL_TRANSCRIPT = auto()    # carries (text, is_final)
    AGENT_SPEAKING_START = auto()
    AGENT_SPEAKING_END = auto()
    TICK = auto()                  # periodic time check

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

`on_event` is deliberately pure — no timers, no I/O, decisions driven by explicit `TICK` events carrying a timestamp. That's what lets `eval/harness.py` replay recorded scenarios through the *same* code that runs live, instead of evaluating a reimplementation. Everything impure (the tick timer, async triggers, frame translation) lives in `turn_taking/pipecat_adapter.py`, which implements Pipecat's `BaseUserTurnStopStrategy` and delegates to our strategy.

### The three-way A/B

Pipecat 1.11 ships its own turn-taking strategies, including `LocalSmartTurnAnalyzerV3`, a bundled semantic end-of-utterance model. Rather than pretend otherwise, `TURN_TAKING_MODE` selects between three arms:

| Mode | What it is | Role |
|---|---|---|
| `baseline` | our `BaselineStrategy` — fixed VAD-silence threshold | the naive approach to beat |
| `smart_turn` | Pipecat's `LocalSmartTurnAnalyzerV3` | the framework default to beat |
| `semantic` | our `SemanticStrategy` — VAD silence + semantic EOU | the contribution |

"Better than naive" is a weak claim when the framework ships something better than naive. "Better than the framework's own turn detector, measured on a published eval set" is the claim worth making — and if ours loses, that's a publishable result too.

Provider interfaces (`providers/*.py`) are small protocols (`transcribe_stream`, `generate_stream`, `synthesize_stream`); local and paid implementations are interchangeable purely via `config.py`.

### Known constraint: partial transcripts

`faster-whisper` transcribes per utterance, after VAD reports speech-end — it does not emit true incremental partials the way Deepgram/AssemblyAI streaming ASR does. The baseline strategy doesn't care (it only needs the final transcript at VAD-silence), but F3 (partials as the user speaks) and F4 (semantic EOU against partials) do. Resolving that means either rolling re-transcription over a sliding window locally, or swapping `STT_PROVIDER` to a streaming provider for the semantic path — which is the swap the provider interface exists to make cheap.

## Data flow

```
Browser mic → LiveKit room → Pipecat pipeline:

  transport.input() → STT → user aggregator → LLM → TTS → transport.output()
                                   │
                          Silero VAD + turn stop strategy
                                   │
                    StrategyUserTurnStopStrategy (adapter)
                                   │
                   TurnTakingStrategy.on_event → WAIT / RESPOND / BARGE_IN_STOP
```

The VAD analyzer and the turn stop strategy are configured on the user aggregator
(`LLMUserAggregatorParams`), which is where Pipecat 1.11 runs the user-turn lifecycle. A
`RESPOND` decision becomes `trigger_user_turn_stopped()`, which is what releases the
turn to the LLM.

Per-turn latency (F6) is Pipecat's `UserBotLatencyObserver`, not a hand-rolled event schema — it already produces per-service TTFB, named contributions that sum to the total (including parts no service measures, like VAD silence wait), and `user_turn_secs`, which isolates exactly the cost the active turn-taking strategy adds. `telemetry/events.py`'s `SessionTurnRecord` only tags a breakdown with which session and which A/B arm it belongs to; `session_recorder.py` appends one per turn to `sessions/<session_id>_<mode>.jsonl`. `backend/scripts/latency_report.py` turns those logs into the p50/p95 numbers and the breakdown chart for the README.

Raw-audio session recording (for offline replay of timing-dependent bugs, PRD §11) is not implemented — that needs LiveKit track recording/egress and is a documented gap, not silently dropped.

The eval harness (`eval/harness.py`) drives `TurnTakingStrategy` directly against recorded scenarios — no LiveKit, no audio I/O, no API cost — for fast iteration on turn-taking accuracy.

### Measurement is part of the system under test

An early TTFT measurement of the local LLM read 2.2s. The real figure was 73–258ms — the
2s was `urllib`'s buffered line iteration delaying the first yield, not the model. The
check that caught it was comparing client-side timing against the server's own
`prompt_eval_duration` for the same request; they now agree within ~4ms.

Since this project's entire claim rests on latency numbers, every instrumented stage
should be cross-checked against an independent clock before its number goes in the
README. A measurement harness that lies is worse than no harness — it produces
confident, wrong conclusions.

Cold start is a separate trap: the first Ollama load is ~17s on CPU. `providers/llm.py`
preloads and pins the model at agent startup so that cost never lands inside a measured
turn.

## Config

A single `TURN_TAKING_MODE=baseline|smart_turn|semantic` setting selects the A/B arm (F7); `STT_PROVIDER` / `LLM_PROVIDER` / `TTS_PROVIDER` select implementations. Defaults are the local/self-hosted providers so the pipeline runs at zero API cost out of the box. `pipeline.py` is the only place that reads config and wires concrete instances — no provider- or strategy-specific branching anywhere else.
