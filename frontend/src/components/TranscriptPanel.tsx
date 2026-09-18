// F3: live transcript + per-turn inspector.
//
// Turns arrive as LiveKit room data messages published by the agent (see
// backend/app/telemetry/turn_publisher.py), so this view is empty until a call is
// running. Nothing here is fixtures — a panel with no data source says so.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, type LiveTurn } from "../lib/session";
import { formatMs } from "../lib/api";
import { Chip, Icon, LabelCaps, Panel } from "./ui";

type Filter = "all" | "user" | "agent" | "interrupted";

const FILTERS: { key: Filter; label: string; dot: string }[] = [
  { key: "all", label: "All turns", dot: "bg-on-surface-variant" },
  { key: "user", label: "User", dot: "bg-secondary" },
  { key: "agent", label: "Agent", dot: "bg-primary" },
  { key: "interrupted", label: "Interrupted", dot: "bg-error" },
];

function tone(turn: LiveTurn) {
  if (turn.interrupted) return { text: "text-error", bar: "bg-error" };
  return turn.speaker === "user"
    ? { text: "text-secondary", bar: "bg-secondary" }
    : { text: "text-primary", bar: "bg-primary" };
}

function clockTime(at: number): string {
  return new Date(at * 1000).toLocaleTimeString(undefined, { hour12: false });
}

function durationMs(turn: LiveTurn): number | null {
  return turn.endedAt === null ? null : Math.round((turn.endedAt - turn.startedAt) * 1000);
}

/** Silence between the previous turn ending and this one starting — the gap the
 *  turn-taking strategy is responsible for. */
function handoverGapMs(turns: LiveTurn[], index: number): number | null {
  if (index === 0) return null;
  const prev = turns[index - 1];
  if (prev.endedAt === null) return null;
  return Math.round((turns[index].startedAt - prev.endedAt) * 1000);
}

function TurnCard({
  turn,
  gapMs,
  selected,
  onSelect,
}: {
  turn: LiveTurn;
  gapMs: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = tone(turn);
  const dur = durationMs(turn);

  return (
    <div className="flex flex-col gap-space-xs">
      {gapMs !== null && (
        <div className="my-space-xs flex items-center justify-center">
          <div className="flex items-center gap-space-sm rounded bg-surface-container px-space-md py-1 font-code-sm text-[11px] text-on-surface-variant">
            <Icon name="hourglass_bottom" className="text-[15px] text-primary" />
            <span className={gapMs > 1000 ? "font-medium text-secondary" : "font-medium text-primary"}>
              handover gap: {formatMs(gapMs)}
            </span>
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect()}
        className="flex cursor-pointer flex-col gap-space-xs outline-none"
      >
        <div className="flex items-center justify-between px-space-xs font-code-sm text-[11px] text-on-surface-variant">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${
                selected ? "bg-primary text-on-primary" : `bg-surface-container-highest ${t.text}`
              }`}
            >
              Turn #{turn.turn} · {turn.speaker === "user" ? "User" : "Agent"}
            </span>
            <span className="text-outline">{clockTime(turn.startedAt)}</span>
          </div>
          <span className={turn.interrupted ? "text-error" : "text-outline"}>
            {turn.interrupted
              ? "interrupted"
              : turn.partial
                ? "in progress…"
                : dur !== null
                  ? `dur ${formatMs(dur)}`
                  : ""}
          </span>
        </div>

        <div
          className={`flex flex-col gap-space-sm rounded p-space-md shadow-sm transition-all ${
            selected ? "bg-surface-container shadow-[inset_0_0_0_1px_#4cd7f6]" : "bg-surface-container-low"
          }`}
        >
          {turn.text ? (
            <p
              className={`font-body-lg text-body-lg leading-relaxed text-on-surface ${
                turn.interrupted ? "line-through decoration-error decoration-2" : ""
              }`}
            >
              {turn.text}
              {turn.partial && <span className="ml-1 animate-pulse text-primary">▌</span>}
            </p>
          ) : (
            <p className="font-body-lg text-body-lg italic text-outline">
              {turn.partial ? "listening…" : "(no transcript)"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex flex-col items-center gap-space-md rounded-xl bg-surface-container-lowest p-space-xl text-center">
      <Icon name="graphic_eq" className="text-[40px] text-outline-variant" />
      <div className="flex flex-col gap-space-xs">
        <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          {connected ? "Waiting for the first turn" : "No live session"}
        </span>
        <p className="max-w-md font-body-sm text-body-sm text-on-surface-variant">
          {connected
            ? "Connected to the room. Turns appear here as the agent publishes them — say something to start one."
            : "Transcripts stream from the running agent over the LiveKit room. Connect on the Voice Call Workspace to start a session."}
        </p>
      </div>
    </div>
  );
}

/** A panel whose data source is not implemented in the running arm. */
function UnavailablePanel({
  label,
  title,
  reason,
}: {
  label: string;
  title: string;
  reason: string;
}) {
  return (
    <Panel tone="low" className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <LabelCaps className="text-outline">{label}</LabelCaps>
        <Chip className="bg-surface-container text-outline">NOT AVAILABLE</Chip>
      </div>
      <span className="font-code-lg text-[14px] font-semibold text-on-surface-variant">{title}</span>
      <p className="font-code-sm text-[11px] leading-relaxed text-outline">{reason}</p>
    </Panel>
  );
}

export function TranscriptPanel() {
  const { turns, receivingTurnEvents, status, config } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const connected = status === "connected";

  const counts = useMemo(
    () => ({
      all: turns.length,
      user: turns.filter((t) => t.speaker === "user").length,
      agent: turns.filter((t) => t.speaker === "agent").length,
      interrupted: turns.filter((t) => t.interrupted).length,
    }),
    [turns]
  );

  const visible = turns.filter((t) =>
    filter === "all" ? true : filter === "interrupted" ? t.interrupted : t.speaker === filter
  );

  // Follow the conversation unless the user has scrolled up to read something.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const selected = turns.find((t) => t.key === selectedKey) ?? turns[turns.length - 1] ?? null;
  const selectedIndex = selected ? turns.findIndex((t) => t.key === selected.key) : -1;
  const selectedGap = selectedIndex >= 0 ? handoverGapMs(turns, selectedIndex) : null;
  const isSemanticArm = config?.turn_taking_mode === "semantic";

  return (
    <div className="flex w-full flex-col">
      <div className="mb-space-md flex flex-col gap-space-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-sm rounded bg-surface-container-low px-space-md py-space-xs">
          <div className="flex flex-wrap items-center gap-space-md font-code-sm text-code-sm">
            <span
              className={`flex items-center gap-space-xs font-medium ${
                receivingTurnEvents ? "text-primary" : "text-outline"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  receivingTurnEvents ? "animate-pulse bg-primary" : "bg-outline-variant"
                }`}
              />
              {receivingTurnEvents ? "RECEIVING TURN EVENTS" : "NO EVENT STREAM"}
            </span>
            <span className="text-outline">/</span>
            <span className="text-on-surface-variant">TRANSPORT: LiveKit data channel</span>
            <span className="text-outline">/</span>
            <span className="font-medium text-secondary">ARM: {config?.turn_taking_mode ?? "—"}</span>
          </div>
          <span className="font-code-sm text-[11px] text-outline">{turns.length} turns this session</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-sm rounded bg-surface-container-lowest p-space-sm">
          <div className="flex flex-wrap items-center gap-space-xs">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-space-xs rounded px-space-md py-1.5 font-code-sm text-code-sm transition-all ${
                    active
                      ? "bg-surface-container-highest font-medium text-primary shadow-sm"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />
                  <span>{f.label}</span>
                  <span className="ml-1 rounded bg-surface-container px-1.5 font-label-caps text-[9px] text-on-surface">
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-space-xs font-code-sm text-[11px] text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-secondary" /> User
            </span>
            <span className="ml-space-sm flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> Agent
            </span>
            <span className="ml-space-sm flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-error" /> Interrupted
            </span>
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-12 items-start gap-space-md">
        <div className="col-span-12 flex flex-col gap-space-md xl:col-span-8">
          {turns.length === 0 ? (
            <EmptyState connected={connected} />
          ) : (
            <>
              <div ref={feedRef} className="flex max-h-[70vh] flex-col gap-space-md overflow-y-auto pr-1">
                {visible.map((turn) => {
                  const index = turns.findIndex((t) => t.key === turn.key);
                  return (
                    <TurnCard
                      key={turn.key}
                      turn={turn}
                      gapMs={filter === "all" ? handoverGapMs(turns, index) : null}
                      selected={selected?.key === turn.key}
                      onSelect={() => setSelectedKey(turn.key)}
                    />
                  );
                })}
              </div>

              {connected && (
                <div className="flex items-center justify-between rounded bg-surface-container-lowest p-space-sm">
                  <div className="flex items-center gap-space-sm">
                    <div className="flex items-end gap-1">
                      <span className="h-3 w-1.5 animate-pulse bg-primary" />
                      <span className="h-5 w-1.5 animate-pulse bg-primary" />
                      <span className="h-2 w-1.5 animate-pulse bg-primary" />
                    </div>
                    <span className="font-code-sm text-code-sm text-primary">Listening for the next turn</span>
                  </div>
                  <span className="font-code-sm text-[11px] text-outline">
                    session {turns.length > 0 ? "active" : "idle"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Inspector rail */}
        <div className="col-span-12 flex flex-col gap-space-md xl:col-span-4">
          <Panel className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between">
              <LabelCaps className="text-primary">Telemetry deck</LabelCaps>
              <span className="font-code-sm text-[11px] text-on-surface-variant">Turn inspector</span>
            </div>
            <div className="flex items-baseline justify-between">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                {selected ? `Turn #${selected.turn}` : "No turn selected"}
              </h2>
              {selected && (
                <Chip className="bg-primary-container px-2 font-bold text-on-primary-container">
                  {selected.speaker === "user" ? "USER" : "AGENT"}
                </Chip>
              )}
            </div>
            <p className="font-code-sm text-code-sm text-on-surface-variant">
              {selected
                ? "Timing measured from the agent's own turn events."
                : "Select a turn once the conversation starts."}
            </p>
          </Panel>

          {selected && (
            <Panel tone="low" className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <LabelCaps className="text-outline">Turn timing</LabelCaps>
                <Icon name="timer" className="text-[18px] text-primary" />
              </div>
              <div className="flex items-baseline gap-space-sm">
                <span className="font-metric-display text-metric-display font-bold text-primary">
                  {formatMs(durationMs(selected))}
                </span>
                <span className="font-metric-unit text-metric-unit uppercase text-on-surface-variant">
                  utterance length
                </span>
              </div>
              <div className="flex flex-col gap-space-xs font-code-sm text-[11px]">
                {[
                  { label: "Started", value: clockTime(selected.startedAt) },
                  {
                    label: "Ended",
                    value: selected.endedAt ? clockTime(selected.endedAt) : "in progress",
                  },
                  {
                    label: "Handover gap before",
                    value: formatMs(selectedGap),
                    tone: selectedGap !== null && selectedGap > 1000 ? "text-secondary" : "text-primary",
                  },
                  {
                    label: "Configured silence threshold",
                    value: config ? `${config.baseline_silence_ms}ms` : "—",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded bg-surface-container-lowest px-space-sm py-space-xs"
                  >
                    <span className="text-on-surface-variant">{row.label}</span>
                    <span className={`font-medium ${row.tone ?? "text-on-surface"}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              {selected.interrupted && (
                <div className="flex items-start gap-space-xs rounded bg-error-container px-space-sm py-space-xs font-code-sm text-[11px] text-on-error-container">
                  <Icon name="bolt" className="text-[14px] text-error" />
                  <span>
                    This agent turn was cut off by an interruption. Barge-in stop budget is{" "}
                    {config?.barge_in_stop_deadline_ms ?? "—"}ms.
                  </span>
                </div>
              )}
            </Panel>
          )}

          <Panel tone="low" className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <LabelCaps className="text-outline">Decision trace</LabelCaps>
              <Chip
                className={
                  isSemanticArm
                    ? "bg-primary-container font-bold text-on-primary-container"
                    : "bg-surface-container text-outline"
                }
              >
                {config?.turn_taking_mode?.toUpperCase() ?? "—"}
              </Chip>
            </div>
            <div className="flex flex-col gap-space-xs rounded bg-surface-container-lowest p-space-sm font-code-sm text-[11px]">
              <div className="flex items-center gap-space-xs font-medium text-on-surface">
                <Icon name="timer" className="text-[15px] text-secondary" />
                <span>
                  {config?.turn_taking_mode === "baseline"
                    ? "Fixed silence threshold"
                    : config?.turn_taking_mode === "smart_turn"
                      ? "Pipecat smart-turn"
                      : "VAD silence + semantic EOU"}
                </span>
              </div>
              <p className="leading-tight text-on-surface-variant">
                {config?.turn_taking_mode === "baseline"
                  ? `Releases the turn after ${config.baseline_silence_ms}ms of VAD silence, with no semantic signal. The handover gap above is that threshold plus detection overhead.`
                  : config?.turn_taking_mode === "smart_turn"
                    ? "Pipecat's LocalSmartTurnAnalyzerV3 decides end-of-utterance from the audio; it does not expose a per-decision trace."
                    : "Semantic end-of-utterance runs against the partial transcript before RESPOND is allowed."}
              </p>
            </div>
          </Panel>

          {isSemanticArm ? (
            <UnavailablePanel
              label="Boundary token logprobs"
              title="Not emitted yet"
              reason="SemanticStrategy does not publish its per-token end-of-utterance probabilities over the event stream. Wiring that is part of implementing turn_taking/semantic.py."
            />
          ) : (
            <UnavailablePanel
              label="Boundary token logprobs"
              title={`Semantic arm only`}
              reason={`The ${config?.turn_taking_mode ?? "current"} arm makes no per-token end-of-utterance prediction, so there is nothing to decompose. Set TURN_TAKING_MODE=semantic to populate this panel.`}
            />
          )}

          <UnavailablePanel
            label="Prosodic intonation"
            title="No pitch extraction"
            reason="Nothing in the pipeline computes an F0 contour. Silero VAD reports speech probability, not pitch, so this would need a separate analyzer."
          />
        </div>
      </div>
    </div>
  );
}
