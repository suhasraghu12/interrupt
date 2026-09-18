// Shared live-call state. The header, sidebar and call stage all read from here so
// that connection status, mic level and the active turn-taking arm stay in sync.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RoomEvent,
  Track,
  createAudioAnalyser,
  type LocalAudioTrack,
  type RemoteAudioTrack,
  type RemoteTrack,
  type Room,
} from "livekit-client";
import { connectToRoom, disconnectFromRoom } from "./livekit-client";

export type CallStatus = "idle" | "connecting" | "connected" | "error";
export type TurnMode = "baseline" | "smart_turn" | "semantic";

/** Mirrors the message shape in backend/app/telemetry/turn_publisher.py. */
const TURN_EVENT_PROTOCOL = 1;

export type TurnEventName =
  | "user_speech_start"
  | "user_speech_end"
  | "partial_transcript"
  | "final_transcript"
  | "agent_speech_start"
  | "agent_speech_end"
  | "agent_text"
  | "interruption";

export interface TurnEvent {
  v: number;
  event: TurnEventName;
  session_id: string;
  turn_taking_mode: TurnMode;
  turn: number;
  at: number;
  speaker?: "user" | "agent";
  text?: string;
}

/** One utterance as assembled from the event stream. */
export interface LiveTurn {
  key: string;
  turn: number;
  speaker: "user" | "agent";
  text: string;
  /** True until the final transcript (user) or the turn ends (agent). */
  partial: boolean;
  startedAt: number;
  endedAt: number | null;
  interrupted: boolean;
}

/** Folds one event into the running transcript. Pure, so it is easy to reason about
 *  out of order or repeated messages. */
function applyTurnEvent(turns: LiveTurn[], event: TurnEvent): LiveTurn[] {
  const speaker = event.speaker ?? (event.event.startsWith("agent") ? "agent" : "user");
  const key = `${speaker}-${event.turn}`;
  const existing = turns.find((t) => t.key === key);

  switch (event.event) {
    case "user_speech_start":
    case "agent_speech_start":
      if (existing) return turns;
      return [
        ...turns,
        {
          key,
          turn: event.turn,
          speaker,
          text: "",
          partial: true,
          startedAt: event.at,
          endedAt: null,
          interrupted: false,
        },
      ];

    case "partial_transcript":
    case "final_transcript":
    case "agent_text": {
      const isFinal = event.event === "final_transcript";
      // An agent's spoken text arrives sentence by sentence, so it accumulates; a user
      // transcript is a full revised hypothesis each time, so it replaces.
      const nextText =
        event.event === "agent_text"
          ? `${existing?.text ?? ""}${existing?.text ? " " : ""}${event.text ?? ""}`.trim()
          : (event.text ?? "");
      if (!existing) {
        return [
          ...turns,
          {
            key,
            turn: event.turn,
            speaker,
            text: nextText,
            partial: !isFinal,
            startedAt: event.at,
            endedAt: null,
            interrupted: false,
          },
        ];
      }
      return turns.map((t) =>
        t.key === key ? { ...t, text: nextText, partial: isFinal ? false : t.partial } : t
      );
    }

    case "user_speech_end":
    case "agent_speech_end":
      return turns.map((t) => (t.key === key ? { ...t, partial: false, endedAt: event.at } : t));

    case "interruption":
      // The agent turn that was playing is the one that got cut off.
      return turns.map((t) =>
        t.speaker === "agent" && t.endedAt === null ? { ...t, interrupted: true, endedAt: event.at } : t
      );

    default:
      return turns;
  }
}

export interface AgentConfig {
  turn_taking_mode: TurnMode;
  stt_provider: string;
  llm_provider: string;
  tts_provider: string;
  baseline_silence_ms: number;
  barge_in_stop_deadline_ms: number;
  turn_tick_interval_ms: number;
  whisper_model: string;
  ollama_model: string;
  piper_voice: string;
}

interface SessionState {
  status: CallStatus;
  error: string | null;
  muted: boolean;
  agentSpeaking: boolean;
  /** 0..1 RMS of the local mic, sampled at 20Hz while connected. */
  micLevel: number;
  /** 0..1 RMS of the agent's audio output, sampled at 20Hz while connected. */
  agentLevel: number;
  /** Seconds since the room connected. */
  elapsed: number;
  config: AgentConfig | null;
  /** Live transcript assembled from the agent's room data messages. */
  turns: LiveTurn[];
  /** True once at least one turn event has arrived this session. */
  receivingTurnEvents: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMute: () => Promise<void>;
  setAgentVolume: (pct: number) => void;
  agentVolume: number;
}

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function rmsToDbfs(level: number): number {
  if (level <= 0.0001) return -60;
  return Math.max(-60, 20 * Math.log10(level));
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const micAnalyserCleanup = useRef<(() => void) | null>(null);
  const agentAnalyserCleanup = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [agentVolume, setAgentVolumeState] = useState(85);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [receivingTurnEvents, setReceivingTurnEvents] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: AgentConfig | null) => c && setConfig(c))
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (status !== "connected") {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const teardownMicAnalyser = useCallback(() => {
    micAnalyserCleanup.current?.();
    micAnalyserCleanup.current = null;
    setMicLevel(0);
  }, []);

  const teardownAgentAnalyser = useCallback(() => {
    agentAnalyserCleanup.current?.();
    agentAnalyserCleanup.current = null;
    setAgentLevel(0);
  }, []);

  const attachMicAnalyser = useCallback((room: Room) => {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = pub?.audioTrack as LocalAudioTrack | undefined;
    if (!track) return;
    const { calculateVolume, cleanup } = createAudioAnalyser(track, { smoothingTimeConstant: 0.4 });
    const id = window.setInterval(() => setMicLevel(calculateVolume()), 50);
    micAnalyserCleanup.current = () => {
      window.clearInterval(id);
      void cleanup();
    };
  }, []);

  const resetCallState = useCallback(() => {
    teardownMicAnalyser();
    teardownAgentAnalyser();
    roomRef.current = null;
    setStatus("idle");
    setMuted(false);
    setAgentSpeaking(false);
    setReceivingTurnEvents(false);
    // The transcript is deliberately kept after a disconnect so the last call stays
    // readable; connect() clears it when a new session starts.
  }, [teardownAgentAnalyser, teardownMicAnalyser]);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setTurns([]);
    setReceivingTurnEvents(false);
    try {
      const room = await connectToRoom(
        "interrupt",
        `user-${Math.random().toString(36).slice(2, 8)}`,
        audioRef.current!
      );
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setAgentSpeaking(speakers.some((p) => p.identity !== room.localParticipant.identity));
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        teardownAgentAnalyser();
        const { calculateVolume, cleanup } = createAudioAnalyser(track as RemoteAudioTrack, {
          smoothingTimeConstant: 0.4,
        });
        const id = window.setInterval(() => setAgentLevel(calculateVolume()), 50);
        agentAnalyserCleanup.current = () => {
          window.clearInterval(id);
          void cleanup();
        };
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) teardownAgentAnalyser();
      });
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        let event: TurnEvent;
        try {
          event = JSON.parse(new TextDecoder().decode(payload));
        } catch {
          return; // not ours, or malformed — the room is shared with anything else publishing
        }
        if (event?.v !== TURN_EVENT_PROTOCOL || !event.event) return;
        setReceivingTurnEvents(true);
        setTurns((prev) => applyTurnEvent(prev, event));
      });
      room.on(RoomEvent.Disconnected, resetCallState);
      roomRef.current = room;
      attachMicAnalyser(room);
      setStatus("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [attachMicAnalyser, resetCallState, teardownAgentAnalyser]);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    if (room) await disconnectFromRoom(room);
    resetCallState();
  }, [resetCallState]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
    if (next) teardownMicAnalyser();
    else attachMicAnalyser(room);
  }, [attachMicAnalyser, muted, teardownMicAnalyser]);

  const setAgentVolume = useCallback((pct: number) => {
    setAgentVolumeState(pct);
    if (audioRef.current) audioRef.current.volume = pct / 100;
  }, []);

  useEffect(
    () => () => {
      teardownMicAnalyser();
      teardownAgentAnalyser();
    },
    [teardownAgentAnalyser, teardownMicAnalyser]
  );

  const value = useMemo<SessionState>(
    () => ({
      status,
      error,
      muted,
      agentSpeaking,
      micLevel,
      agentLevel,
      elapsed,
      config,
      turns,
      receivingTurnEvents,
      audioRef,
      connect,
      disconnect,
      toggleMute,
      agentVolume,
      setAgentVolume,
    }),
    [
      status,
      error,
      muted,
      agentSpeaking,
      micLevel,
      agentLevel,
      elapsed,
      config,
      turns,
      receivingTurnEvents,
      connect,
      disconnect,
      toggleMute,
      agentVolume,
      setAgentVolume,
    ]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
      <audio ref={audioRef} autoPlay />
    </SessionContext.Provider>
  );
}
