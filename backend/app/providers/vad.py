"""Silero VAD (F2). Pipecat ships Silero as a VAD analyzer that the transport runs over
incoming audio, emitting VADUserStartedSpeakingFrame / VADUserStoppedSpeakingFrame --
which is exactly the speech-start / speech-end signal the turn-taking strategies consume.
"""

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams

from app.config import Settings


def build_vad_analyzer(settings: Settings) -> SileroVADAnalyzer:
    # stop_secs is deliberately well below baseline_silence_ms: VAD reports raw acoustic
    # silence, and deciding how long a silence has to last before it means "your turn" is
    # the turn-taking strategy's job, not the VAD's.
    return SileroVADAnalyzer(params=VADParams(stop_secs=0.2))
