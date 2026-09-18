# Interrupt

A full-duplex-feeling voice agent with an explicit, measurable turn-taking module — benchmarked against the naive fixed-silence-threshold approach most voice-agent demos ship with.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design and module breakdown.

## Status

Architecture scaffolded. Pipeline implementation in progress — see milestones below.

## Results

_Filled in after Week 2 (baseline numbers) and Week 3 (custom turn-taking numbers). See the PRD success metrics table for the target format._

| Metric | Baseline | Interrupt | Target |
|---|---|---|---|
| End-of-turn → first audio out (p50) | — | — | < 600ms |
| End-of-turn → first audio out (p95) | — | — | < 1000ms |
| Barge-in stop latency | n/a | — | < 200ms |
| False interruption rate | — | — | < 5% |
| Missed turn rate | — | — | < 10% |
| Backchannel false-stop rate | 100% | — | < 15% |

## Quickstart

_Coming with the Week 1 milestone (working baseline agent)._

## Milestones

| Week | Deliverable |
|---|---|
| 1 | Working baseline agent (fixed-threshold turn-taking) |
| 2 | Full instrumentation + baseline latency numbers |
| 3 | Custom turn decision (VAD + semantic EOU) |
| 4 | Barge-in + backchannel detection |
| 5 | Eval harness, demo video, writeup, published eval dataset |

## License

TBD
