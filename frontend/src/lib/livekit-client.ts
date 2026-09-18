// Thin wrapper around livekit-client: fetches a room token from the backend and
// connects, exposing mic publish + remote audio track subscription.

export async function connectToRoom(room: string, identity: string) {
  // TODO(week 1): fetch token from /api/token, Room.connect(), publish mic track,
  // subscribe to agent audio track for playback.
  throw new Error("not implemented");
}
