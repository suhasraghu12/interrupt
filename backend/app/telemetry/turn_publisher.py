"""Publishes live turn events -- transcripts, speech boundaries, interruptions -- into
the LiveKit room as data messages, so the frontend's transcript view sees them as they
happen.

This goes into the room rather than through the FastAPI server because the agent worker
(main.py) and the API server (server.py) are separate processes. The browser is already
joined to the room, so publishing there avoids inventing an IPC channel between them and
avoids a disk round-trip. The agent is the only publisher; the browser only listens.

It reads frames through an observer rather than a pipeline processor so that adding or
removing it cannot change how frames flow.
"""

import json
import time
from typing import Any

from loguru import logger
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    InterimTranscriptionFrame,
    InterruptionFrame,
    TranscriptionFrame,
    TTSTextFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.observers.base_observer import BaseObserver, FramePushed
from pipecat.transports.livekit.transport import LiveKitTransport

# Bumped when the message shape changes so a stale frontend can ignore what it cannot read.
PROTOCOL_VERSION = 1


class TurnEventPublisher(BaseObserver):
    """Translates pipeline frames into room data messages for the transcript view."""

    def __init__(self, transport: LiveKitTransport, session_id: str, turn_taking_mode: str):
        super().__init__()
        self._transport = transport
        self._session_id = session_id
        self._mode = turn_taking_mode
        self._turn = 0
        # Interim transcripts arrive many times per utterance; only the changed text is
        # worth a message, or the data channel carries the same string dozens of times.
        self._last_interim = ""
        # A frame is pushed between several processor pairs, so the same frame reaches
        # the observer more than once. Pipecat frame ids are monotonic, so remembering
        # the highest id seen per frame type collapses those repeats without the set of
        # seen ids growing for the length of the call.
        self._last_id: dict[type, int] = {}

    async def _publish(self, event: str, **payload: Any) -> None:
        message = {
            "v": PROTOCOL_VERSION,
            "event": event,
            "session_id": self._session_id,
            "turn_taking_mode": self._mode,
            "turn": self._turn,
            "at": time.time(),
            **payload,
        }
        try:
            await self._transport.send_message(json.dumps(message))
        except Exception as e:  # noqa: BLE001 -- deliberately broad
            # This is telemetry on the critical path of a live call. Whatever the
            # transport throws, a dropped message must degrade the transcript view, not
            # take the conversation down with it.
            logger.warning(f"turn event publish failed ({event}): {e}")

    async def on_push_frame(self, data: FramePushed) -> None:
        frame = data.frame
        if frame.id <= self._last_id.get(type(frame), -1):
            return
        self._last_id[type(frame)] = frame.id

        if isinstance(frame, UserStartedSpeakingFrame):
            self._turn += 1
            self._last_interim = ""
            await self._publish("user_speech_start")
        elif isinstance(frame, UserStoppedSpeakingFrame):
            await self._publish("user_speech_end")
        elif isinstance(frame, InterimTranscriptionFrame):
            if frame.text and frame.text != self._last_interim:
                self._last_interim = frame.text
                await self._publish("partial_transcript", speaker="user", text=frame.text)
        elif isinstance(frame, TranscriptionFrame):
            await self._publish("final_transcript", speaker="user", text=frame.text)
        elif isinstance(frame, BotStartedSpeakingFrame):
            self._turn += 1
            await self._publish("agent_speech_start")
        elif isinstance(frame, BotStoppedSpeakingFrame):
            await self._publish("agent_speech_end")
        elif isinstance(frame, TTSTextFrame):
            await self._publish("agent_text", speaker="agent", text=frame.text)
        elif isinstance(frame, InterruptionFrame):
            await self._publish("interruption")
