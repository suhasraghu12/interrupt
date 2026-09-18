// F6/F10: per-turn latency decomposition, read from the sessions the agent recorded.
//
// Every number here comes from GET /api/sessions/<id>/turns, which rolls up Pipecat's
// own LatencyBreakdown. Connection setup is held out of the per-turn totals server-side
// (see app/telemetry/aggregate.py) — counting it would inflate the first turn of every
// session by the cold-start cost.

import { Fragment, useEffect, useState } from "react";
import {
  formatMs,
  useApi,
  type LatencySummary,
  type SessionSummary,
  type SessionTurns,
  type TurnView,
} from "../lib/api";
import { useSession } from "../lib/session";
import { Chip, Icon, LabelCaps, Metric, PageHeading, Panel, PanelHeading } from "./ui";

const STAGES = [
  { key: "vad", label: "VAD & boundary", bar: "bg-secondary", text: "text-secondary" },
  { key: "asr", label: "ASR", bar: "bg-tertiary", text: "text-tertiary" },
  { key: "llm", label: "LLM first token", bar: "bg-primary", text: "text-primary" },
  { key: "tts", label: "TTS & output", bar: "bg-primary-fixed-dim", text: "text-primary-fixed-dim" },
  { key: "other", label: "Unattributed", bar: "bg-outline", text: "text-outline" },
] as const;

const LABEL_COL = 140;
const TOTAL_COL = 100;

/** Chart width: round the slowest turn up so the axis divisions stay whole. */
function chartWindowMs(turns: TurnView[]): number {
  const slowest = Math.max(0, ...turns.map((t) => t.total_ms));
  if (slowest === 0) return 700;
  const division = Math.pow(10, Math.floor(Math.log10(slowest / 6)));
  return Math.ceil(slowest / division) * division;
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <div className="flex flex-col items-center gap-space-md rounded-xl bg-surface-container-lowest p-space-xl text-center">
      <Icon name="timeline" className="text-[40px] text-outline-variant" />
      <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
        {error ? "Could not read recorded sessions" : "No recorded sessions yet"}
      </span>
      <p className="max-w-lg font-body-sm text-body-sm text-on-surface-variant">
        {error ? (
          <code className="text-error">{error}</code>
        ) : (
          <>
            The agent writes one JSONL record per turn to <code className="text-primary">sessions/</code> as
            it runs. Have a conversation on the Voice Call Workspace, then come back — this chart reads
            those files.
          </>
        )}
      </p>
    </div>
  );
}

function WaterfallRow({ turn, windowMs }: { turn: TurnView; windowMs: number }) {
  const overBudget = turn.total_ms > 1000;
  const tone = overBudget ? "text-error" : turn.total_ms > 600 ? "text-secondary" : "text-primary";

  return (
    <div className="group relative flex h-9 cursor-crosshair items-center rounded bg-surface-container-low px-2 transition-all hover:bg-surface-container hover:shadow-[inset_0_0_0_1px_#4cd7f6]">
      <div className="flex shrink-0 items-center gap-1.5" style={{ width: LABEL_COL }}>
        <span className={`h-1.5 w-1.5 rounded-full ${overBudget ? "bg-error" : "bg-outline-variant"}`} />
        <span className={`font-code-sm text-[12px] font-semibold ${tone}`}>
          Turn #{String(turn.turn).padStart(2, "0")}
        </span>
        {turn.setup_ms > 0 && (
          <span
            className="font-code-sm text-[10px] text-outline"
            title={`${formatMs(turn.setup_ms)} of connection setup is excluded from this turn's total`}
          >
            +setup
          </span>
        )}
      </div>

      <div className="relative flex h-5 flex-1 overflow-hidden bg-surface-container-lowest">
        {STAGES.map((stage) => {
          const ms = turn.stages[stage.key] ?? 0;
          if (ms <= 0) return null;
          return (
            <div
              key={stage.key}
              className={`h-full ${stage.bar}`}
              style={{ width: `${(ms / windowMs) * 100}%` }}
              title={`${stage.label}: ${formatMs(ms)}`}
            />
          );
        })}
      </div>

      <div
        className={`shrink-0 pr-2 text-right font-code-sm text-[12px] font-bold tabular-nums ${tone}`}
        style={{ width: TOTAL_COL }}
      >
        {formatMs(turn.total_ms)}
      </div>

      <div className="pointer-events-none absolute right-4 top-10 z-30 hidden w-72 flex-col gap-1 rounded-lg bg-surface-container-highest p-space-sm shadow-xl group-hover:flex">
        <div className="flex justify-between rounded bg-surface-variant px-1 pb-1 font-code-sm text-[11px]">
          <span className="font-bold text-primary">Turn #{turn.turn} breakdown</span>
          <span className="text-on-surface">{formatMs(turn.total_ms)}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-code-sm text-[10px] text-on-surface-variant">
          {STAGES.map((stage) => (
            <Fragment key={stage.key}>
              <span>{stage.label}:</span>
              <span className={`font-semibold ${stage.text}`}>{formatMs(turn.stages[stage.key] ?? 0)}</span>
            </Fragment>
          ))}
          <span className="text-outline">Turn-taking overhead:</span>
          <span className="text-on-surface">{formatMs(turn.turn_taking_ms)}</span>
          {turn.setup_ms > 0 && (
            <>
              <span className="text-outline">Setup (excluded):</span>
              <span className="text-outline">{formatMs(turn.setup_ms)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function LatencyDashboard() {
  const { config } = useSession();
  const sessions = useApi<SessionSummary[]>("/sessions");
  const summary = useApi<LatencySummary>("/latency/summary");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Default to the newest recording once the list lands.
  useEffect(() => {
    if (sessionId === null && sessions.data?.length) setSessionId(sessions.data[0].session_id);
  }, [sessions.data, sessionId]);

  const detail = useApi<SessionTurns>(sessionId ? `/sessions/${sessionId}/turns` : null, [sessionId]);
  const turns = detail.data?.turns ?? [];
  const windowMs = chartWindowMs(turns);
  const divisions = 7;

  const meanStage = (key: (typeof STAGES)[number]["key"]) =>
    turns.length ? turns.reduce((sum, t) => sum + (t.stages[key] ?? 0), 0) / turns.length : null;

  const hasData = (sessions.data?.length ?? 0) > 0;

  return (
    <div className="flex w-full flex-col">
      <div className="mb-space-md flex flex-wrap items-center justify-between gap-space-md rounded-lg bg-surface-container-lowest px-space-md py-space-sm">
        <div className="flex flex-wrap items-center gap-space-md">
          <div className="flex items-center gap-space-xs">
            <span
              className={`inline-block h-2 w-2 rounded-full ${hasData ? "bg-primary" : "bg-outline-variant"}`}
            />
            <LabelCaps className="text-on-surface-variant">Observer</LabelCaps>
            <span className="font-code-sm text-code-sm font-semibold text-primary">
              Pipecat UserBotLatencyObserver
            </span>
          </div>
          <span className="font-code-sm text-surface-variant">/</span>
          <div className="flex items-center gap-space-xs">
            <Icon name="speed" className="text-[16px] text-secondary" />
            <LabelCaps className="text-on-surface-variant">Live arm:</LabelCaps>
            <span className="font-code-sm text-code-sm font-medium text-on-surface">
              {config?.turn_taking_mode ?? "unknown"}
            </span>
          </div>
        </div>

        {hasData && (
          <label className="flex items-center gap-space-xs font-code-sm text-code-sm">
            <LabelCaps className="text-outline">Session</LabelCaps>
            <select
              value={sessionId ?? ""}
              onChange={(e) => setSessionId(e.target.value)}
              className="rounded bg-surface-container-low px-space-sm py-1 font-code-sm text-code-sm text-on-surface outline-none focus:bg-surface-container"
            >
              {sessions.data!.map((s) => (
                <option key={s.session_id} value={s.session_id}>
                  {s.session_id} · {s.turn_taking_mode} · {s.turns} turn{s.turns === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <PageHeading
        eyebrow="Telemetry deck · Acoustic decomposition"
        title="Pipeline Latency Waterfall"
        description="Per-segment latency accounting across turn detection, streaming speech recognition, first-token generation and speech synthesis. Read from recorded sessions on disk."
        actions={
          sessionId && (
            <a
              href={`/api/sessions/${sessionId}/turns`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded bg-surface-container-high px-space-md py-1.5 font-code-sm text-code-sm text-on-surface shadow-sm transition-colors hover:bg-surface-variant"
            >
              <Icon name="download" className="text-[16px] text-primary" />
              Raw JSON
            </a>
          )
        }
      />

      {!hasData || sessions.error ? (
        <EmptyState error={sessions.error} />
      ) : (
        <>
          <div className="mb-space-lg grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-5">
            <Metric
              label="Median end-to-end"
              value={formatMs(summary.data?.p50_ms ?? null)}
              valueClass="text-primary"
              icon="timer"
              footer={
                <Chip className="truncate bg-surface-container-high text-primary">
                  p95 {formatMs(summary.data?.p95_ms ?? null)} · target &lt; 600ms
                </Chip>
              }
            />
            {STAGES.slice(0, 4).map((stage) => (
              <Metric
                key={stage.key}
                label={`Mean ${stage.label}`}
                value={formatMs(meanStage(stage.key))}
                valueClass={stage.text}
                icon={
                  stage.key === "vad"
                    ? "record_voice_over"
                    : stage.key === "asr"
                      ? "transcribe"
                      : stage.key === "llm"
                        ? "psychology"
                        : "volume_up"
                }
                iconClass={stage.text}
                footer={
                  <span className="truncate font-code-sm text-[10px] text-outline">
                    {stage.key === "asr"
                      ? (config?.whisper_model ?? "—")
                      : stage.key === "llm"
                        ? (config?.ollama_model ?? "—")
                        : stage.key === "tts"
                          ? (config?.piper_voice ?? "—")
                          : `threshold ${config?.baseline_silence_ms ?? "—"}ms`}
                  </span>
                }
              />
            ))}
          </div>

          <Panel className="relative mb-space-lg p-space-lg shadow-md">
            <div className="mb-space-md flex flex-col items-start justify-between gap-space-sm pb-space-md lg:flex-row lg:items-center">
              <div>
                <div className="flex items-center gap-space-sm">
                  <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                    Multi-turn waterfall track
                  </h2>
                  <Chip className="bg-surface-variant text-primary">
                    {detail.data?.turn_taking_mode ?? "—"} · {turns.length} turns
                  </Chip>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Aligned to the user's speech end point. Hover a row for the full breakdown.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-space-md rounded-lg bg-surface-container-low px-space-md py-1.5">
                {STAGES.map((stage) => (
                  <div key={stage.key} className="flex items-center gap-1.5">
                    <span className={`h-3 w-3 ${stage.bar}`} />
                    <span className="font-code-sm text-[11px] text-on-surface">{stage.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {detail.loading ? (
              <div className="py-space-xl text-center font-code-sm text-code-sm text-outline">Loading turns…</div>
            ) : turns.length === 0 ? (
              <div className="py-space-xl text-center font-code-sm text-code-sm text-outline">
                This session recorded no turns.
              </div>
            ) : (
              <div className="relative w-full overflow-x-auto">
                <div className="relative flex min-w-[760px] flex-col pb-4">
                  <div className="mb-2 flex h-8 items-center rounded bg-surface-container-high px-2 font-code-sm text-[11px] font-medium text-on-surface-variant">
                    <div className="shrink-0 text-left" style={{ width: LABEL_COL }}>
                      <LabelCaps className="text-outline">Turn</LabelCaps>
                    </div>
                    <div className="grid flex-1 pl-1 text-left" style={{ gridTemplateColumns: `repeat(${divisions}, minmax(0, 1fr))` }}>
                      {Array.from({ length: divisions }, (_, i) => (
                        <span key={i}>{i === 0 ? "0 (stop)" : formatMs((windowMs / divisions) * i)}</span>
                      ))}
                    </div>
                    <div className="shrink-0 pr-2 text-right" style={{ width: TOTAL_COL }}>
                      E2E total
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {turns.map((turn) => (
                      <WaterfallRow key={turn.turn} turn={turn} windowMs={windowMs} />
                    ))}
                  </div>

                  <div className="mt-2 flex items-center pt-3 font-code-sm text-[10px] text-outline">
                    <div className="shrink-0" style={{ width: LABEL_COL }}>
                      Scale: {formatMs(windowMs / divisions)} / division
                    </div>
                    <div className="flex-1 px-1">
                      Connection setup excluded from totals — see app/telemetry/aggregate.py
                    </div>
                    <div className="shrink-0 pr-2 text-right" style={{ width: TOTAL_COL }}>
                      N={turns.length}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-space-md lg:grid-cols-3">
            <Panel className="flex flex-col gap-space-md shadow-sm lg:col-span-2">
              <PanelHeading
                icon="bar_chart"
                title="Latency distribution"
                badge={
                  <span className="font-code-sm text-[11px] text-outline">
                    N = {summary.data?.total_turns ?? 0} turns, all sessions
                  </span>
                }
              />
              <div className="relative flex h-32 w-full items-end justify-between gap-1 px-1 pb-2 pt-5">
                {(summary.data?.histogram ?? []).map((bucket) => (
                  <div
                    key={bucket.label}
                    title={`${bucket.label}ms: ${bucket.count} turns`}
                    style={{ height: `${Math.max(bucket.height, bucket.count > 0 ? 4 : 1)}%` }}
                    className={`flex-1 transition-all ${
                      bucket.count > 0 ? "bg-primary hover:bg-primary-fixed" : "bg-surface-container-high"
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between px-1 font-code-sm text-[10px] text-outline">
                {(summary.data?.histogram ?? []).map((bucket) => (
                  <span key={bucket.label} className="flex-1 truncate text-center">
                    {bucket.label.split("-")[0]}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-space-xs rounded bg-surface-container-low p-space-xs text-center">
                {[
                  { label: "p50 median", value: summary.data?.p50_ms, tone: "text-primary" },
                  { label: "p90 tail", value: summary.data?.p90_ms, tone: "text-secondary" },
                  { label: "p95 outlier", value: summary.data?.p95_ms, tone: "text-error" },
                ].map((p) => (
                  <div key={p.label} className="flex flex-col">
                    <LabelCaps className="font-semibold text-outline">{p.label}</LabelCaps>
                    <span className={`font-code-sm text-code-sm font-bold ${p.tone}`}>
                      {formatMs(p.value ?? null)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="flex flex-col gap-space-md shadow-sm">
              <PanelHeading
                icon="inventory_2"
                title="Recorded sessions"
                iconClass="text-secondary"
                badge={<Chip>{sessions.data?.length ?? 0}</Chip>}
              />
              <div className="flex flex-col gap-space-xs">
                {(sessions.data ?? []).slice(0, 8).map((s) => (
                  <button
                    key={s.session_id}
                    type="button"
                    onClick={() => setSessionId(s.session_id)}
                    className={`flex items-center justify-between rounded px-space-sm py-space-xs text-left font-code-sm text-[11px] transition-colors ${
                      s.session_id === sessionId
                        ? "bg-surface-container-highest text-primary"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{s.session_id}</span>
                      <span className="text-outline">
                        {s.turn_taking_mode} · {s.turns} turn{s.turns === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatMs(s.p50_ms)}</span>
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
