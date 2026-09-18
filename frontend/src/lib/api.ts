// Typed access to the backend's recorded-telemetry endpoints.
//
// Live per-turn events do not come through here — the agent publishes those into the
// LiveKit room and session.tsx picks them up. This module is only for what has been
// recorded to disk: sessions/*.jsonl, rolled up by app/telemetry/aggregate.py.

import { useEffect, useState } from "react";

export const STAGE_ORDER = ["vad", "asr", "llm", "tts", "other"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export interface TurnView {
  turn: number;
  recorded_at: number;
  turn_taking_mode: string;
  stages: Record<Stage, number>;
  total_ms: number;
  /** Connection setup held out of total_ms; large on the first turn of a session. */
  setup_ms: number;
  turn_taking_ms: number | null;
}

export interface HistogramBucket {
  label: string;
  from_ms: number;
  count: number;
  height: number;
}

export interface SessionSummary {
  session_id: string;
  turn_taking_mode: string;
  turns: number;
  recorded_at: number;
  p50_ms: number | null;
  p95_ms: number | null;
}

export interface SessionTurns {
  session_id: string;
  turn_taking_mode: string;
  turns: TurnView[];
  histogram: HistogramBucket[];
}

export interface ModeSummary {
  turn_taking_mode: string;
  turns: number;
  sessions: number;
  p50_ms: number;
  p95_ms: number;
  mean_ms: number;
  turn_taking_p50_ms: number | null;
}

export interface LatencySummary {
  modes: ModeSummary[];
  total_turns: number;
  histogram: HistogramBucket[];
  p50_ms: number | null;
  p90_ms: number | null;
  p95_ms: number | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type Async<T> = { data: T | null; error: string | null; loading: boolean };

/** Fetches once on mount. Telemetry is written by a separate process, so `deps` is how
 *  a view re-reads it (e.g. after the user picks a different recorded session). */
export function useApi<T>(path: string | null, deps: unknown[] = []): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, error: null, loading: path !== null });

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    get<T>(path)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e: Error) => !cancelled && setState({ data: null, error: e.message, loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return state;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
