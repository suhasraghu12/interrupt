// Mic capture, LiveKit room connect, agent audio playback (F1). The main call UI.

import { useRef, useState } from "react";
import { RoomEvent, type Room } from "livekit-client";
import { connectToRoom, disconnectFromRoom } from "../lib/livekit-client";

type Status = "idle" | "connecting" | "connected" | "error";

export function CallView() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  async function handleConnect() {
    setStatus("connecting");
    setError(null);
    try {
      const room = await connectToRoom(
        "interrupt",
        `user-${Math.random().toString(36).slice(2, 8)}`,
        audioRef.current!
      );
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeaking(speakers.length > 0);
      });
      room.on(RoomEvent.Disconnected, () => {
        setStatus("idle");
        setMuted(false);
        setSpeaking(false);
        roomRef.current = null;
      });
      roomRef.current = room;
      setStatus("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  async function handleDisconnect() {
    if (roomRef.current) {
      await disconnectFromRoom(roomRef.current);
      roomRef.current = null;
    }
    setStatus("idle");
    setMuted(false);
    setSpeaking(false);
  }

  async function handleToggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  const orbClass = [
    "orb",
    status === "connecting" && "connecting",
    status === "connected" && !muted && "connected",
    speaking && "speaking",
    muted && "muted",
  ]
    .filter(Boolean)
    .join(" ");

  const statusLabel: Record<Status, string> = {
    idle: "Not connected",
    connecting: "Connecting…",
    connected: muted ? "Connected · muted" : speaking ? "Agent speaking…" : "Listening",
    error: "Connection failed",
  };

  return (
    <div>
      <div className="orb-wrap">
        <div className={orbClass} />
      </div>

      <div className="status-row">
        <span className={`status-dot ${status}`} />
        <span>{statusLabel[status]}</span>
      </div>

      <div className="controls">
        {status === "connected" ? (
          <>
            <button className="btn-secondary" onClick={handleToggleMute}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <button className="btn-danger" onClick={handleDisconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            className="btn-primary"
            onClick={handleConnect}
            disabled={status === "connecting"}
          >
            Connect
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <audio ref={audioRef} autoPlay />
    </div>
  );
}
