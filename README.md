# Interrupt

A full-duplex-feeling voice agent with an explicit, measurable turn-taking module — benchmarked against the naive fixed-silence-threshold approach most voice-agent demos ship with.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design and module breakdown.

## Status

Weeks 1–2 done: a working baseline agent (fixed-silence-threshold turn-taking) runs
end-to-end on a local-only stack, and every turn is instrumented with per-service
latency (`backend/app/telemetry/`) via Pipecat's own latency observer. `semantic.py`
and `backchannel.py` are scaffolded with the target interface but not yet implemented
— that's the week 3–4 work. The eval harness (`eval/harness.py`) is stubbed pending
week 5's scenario dataset.

## Results

_Filled in after Week 2 (baseline numbers, in progress) and Week 3 (custom
turn-taking numbers). See the PRD success metrics table for the target format._

Three arms: the naive fixed-threshold baseline, Pipecat's built-in
`LocalSmartTurnAnalyzerV3`, and our strategy. The framework default is in the table on
purpose — beating "naive" is easy, beating the thing most people would actually ship is
the result worth publishing.

| Metric | Baseline | Pipecat smart-turn | Interrupt | Target |
|---|---|---|---|---|
| End-of-turn → first audio out (p50) | — | — | — | < 600ms |
| End-of-turn → first audio out (p95) | — | — | — | < 1000ms |
| Barge-in stop latency | n/a | — | — | < 200ms |
| False interruption rate | — | — | — | < 5% |
| Missed turn rate | — | — | — | < 10% |
| Backchannel false-stop rate | 100% | — | — | < 15% |

## Quickstart

Runs fully locally with no paid API keys — LiveKit dev server, Silero VAD,
faster-whisper, a small Ollama model, and Piper TTS. See
[docs/local-dev-setup.md](docs/local-dev-setup.md) for the four processes you need
running.

## Milestones

| Week | Deliverable | Status |
|---|---|---|
| 1 | Working baseline agent (fixed-threshold turn-taking) | Done |
| 2 | Full instrumentation + baseline latency numbers | Instrumentation done, numbers pending |
| 3 | Custom turn decision (VAD + semantic EOU) | Not started |
| 4 | Barge-in + backchannel detection | Not started |
| 5 | Eval harness, demo video, writeup, published eval dataset | Not started |

## License

Apache 2.0 — see [LICENSE](LICENSE).
