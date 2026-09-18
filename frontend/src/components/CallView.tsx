// Mic capture, LiveKit room connect, agent audio playback (F1). The main call UI.

import { useRef, useState } from "react";
import type { Room } from "livekit-client";
import { connectToRoom, disconnectFromRoom } from "../lib/livekit-client";

type Status = "idle" | "connecting" | "connected" | "error";

export function CallView() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  async function handleConnect() {
    setStatus("connecting");
    setError(null);
    try {
      roomRef.current = await connectToRoom(
        "interrupt",
        `user-${Math.random().toString(36).slice(2, 8)}`,
        audioRef.current!
      );
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
  }

  async function handleToggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  return (
    <div>
      <p>Status: {status}</p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {status === "connected" ? (
        <>
          <button onClick={handleDisconnect}>Disconnect</button>
          <button onClick={handleToggleMute}>{muted ? "Unmute" : "Mute"}</button>
        </>
      ) : (
        <button onClick={handleConnect} disabled={status === "connecting"}>
          Connect
        </button>
      )}
      <audio ref={audioRef} autoPlay />
    </div>
  );
}
