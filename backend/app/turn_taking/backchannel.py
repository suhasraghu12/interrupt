"""F8: filters BARGE_IN_STOP decisions so short acknowledgements ("mhm", "yeah",
"okay") during agent playback don't stop TTS. Deliberately a filter in front of the
strategy's barge-in decision, not folded into VAD or STT, so it can be tuned and
tested in isolation. Per the PRD's open question, test VAD-timing heuristics and
transcript word-matching separately before combining.
"""

from app.turn_taking.base import TranscriptPayload


class BackchannelFilter:
    def is_backchannel(self, transcript: TranscriptPayload, speech_duration_ms: float) -> bool:
        # TODO(week 4): word-match against a short acknowledgement list and/or
        # duration/energy heuristic; compare false-stop rate of each in isolation.
        raise NotImplementedError
