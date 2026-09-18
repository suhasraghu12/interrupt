"""F9: replays recorded scenarios (eval/scenarios/) against a TurnTakingStrategy
directly -- no LiveKit, no audio I/O, no API cost -- and scores decisions against
ground-truth labels via report.py. This is how week 3+ iteration on turn-taking
accuracy happens without burning API budget (PRD risk: API costs during iterative
testing).
"""

from pathlib import Path

SCENARIOS_DIR = Path(__file__).parent / "scenarios"


def load_scenarios(dir_: Path = SCENARIOS_DIR):
    # TODO(week 5): load (audio, event_trace, label) tuples for each scenario.
    raise NotImplementedError


def run(strategy_name: str) -> None:
    # TODO(week 5): feed each scenario's events into the named TurnTakingStrategy,
    # collect decisions, hand off to report.py.
    raise NotImplementedError
