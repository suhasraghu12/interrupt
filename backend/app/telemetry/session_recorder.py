"""Persists raw session audio plus the full TurnStageEvent trace to disk per session.
Risk mitigation from the PRD: real-time turn-taking bugs are timing-dependent and hard
to reproduce live, so every session must be replayable offline against the eval
harness or a debugger without needing to re-trigger the bug in real time.
"""

from pathlib import Path


class SessionRecorder:
    def __init__(self, session_id: str, out_dir: Path):
        # TODO(week 1): open audio file handle + event log for this session.
        raise NotImplementedError

    def record_audio_chunk(self, chunk: bytes) -> None:
        raise NotImplementedError

    def record_event(self, event: "TurnStageEvent") -> None:  # noqa: F821
        raise NotImplementedError

    def close(self) -> None:
        raise NotImplementedError
