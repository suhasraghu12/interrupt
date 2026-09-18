// Thin wrapper around livekit-client: fetches a room token from the backend and
// connects, exposing mic publish + remote audio track subscription.

import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

interface TokenResponse {
  token: string;
  url: string;
}

async function fetchToken(room: string, identity: string): Promise<TokenResponse> {
  const params = new URLSearchParams({ room, identity });
  const res = await fetch(`/api/token?${params}`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function connectToRoom(
  roomName: string,
  identity: string,
  audioEl: HTMLAudioElement
): Promise<Room> {
  const { token, url } = await fetchToken(roomName, identity);
  const room = new Room();

  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      track.attach(audioEl);
    }
  });
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach(audioEl);
    }
  });

  await room.connect(url, token);

  // Echo cancellation is load-bearing, not cosmetic: without it the agent's own
  // playback leaks into the mic and the VAD treats it as user speech, which will
  // make the agent interrupt itself once barge-in lands.
  await room.localParticipant.setMicrophoneEnabled(true, {
    echoCancellation: true,
    noiseSuppression: true,
  });

  return room;
}

export async function disconnectFromRoom(room: Room): Promise<void> {
  await room.disconnect();
}
