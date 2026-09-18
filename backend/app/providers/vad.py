"""Silero VAD wrapper. Emits speech-start / speech-end events (F2) from a raw audio
frame stream. This is the only module that talks to Silero directly.
"""


class SileroVad:
    def __init__(self):
        # TODO(week 1): load Silero VAD model.
        raise NotImplementedError

    def process_frame(self, frame: bytes) -> str | None:
        """Returns 'speech_start', 'speech_end', or None."""
        raise NotImplementedError
