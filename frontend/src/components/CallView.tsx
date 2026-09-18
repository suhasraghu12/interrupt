// The live call stage (F1): mic capture, agent playback, and the instrument readouts
// that surround them. Everything on this screen is driven by real room state — the
// oscilloscope traces are Web Audio RMS off the local mic and the agent's output track.

import { useEffect, useRef, useState } from "react";
import { useSession, type AgentConfig } from "../lib/session";
import { Chip, Icon, LabelCaps, Panel, PanelHeading } from "./ui";

const SCOPE_SAMPLES = 48;

/** Rolling window of the most recent level samples, newest on the right. */
function useLevelHistory(level: number, active: boolean): number[] {
  const [history, setHistory] = useState<number[]>(() => new Array(SCOPE_SAMPLES).fill(0));
  const latest = useRef(level);
  latest.current = active ? level : 0;

  useEffect(() => {
    const id = window.setInterval(() => {
      setHistory((prev) => [...prev.slice(1), latest.current]);
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  return history;
}

function traceHeight(level: number): string {
  // RMS off a voice track rarely exceeds ~0.35, so scale before clamping or the
  // trace sits flat against the baseline.
  return `${Math.max(2, Math.min(100, level * 280))}%`;
}

function ScopeTrace({ history, tone }: { history: number[]; tone: "user" | "agent" }) {
  const isUser = tone === "user";
  return (
    <div
      className={`relative flex h-1/2 w-full justify-between gap-[2px] overflow-hidden px-1 ${
        isUser ? "items-end" : "items-start"
      }`}
    >
      {history.map((level, i) => (
        <div
          key={i}
          className={`w-1 transition-[height] duration-75 ${
            isUser ? "bg-secondary" : "bg-primary"
          } ${level < 0.01 ? "opacity-20" : "opacity-100"}`}
          style={{ height: traceHeight(level) }}
        />
      ))}
    </div>
  );
}

function ParamReadout({
  label,
  value,
  pct,
  barClass,
  scale,
}: {
  label: string;
  value: string;
  pct: number;
  barClass: string;
  scale: [string, string];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between font-code-sm text-code-sm">
        <span className="text-on-surface-variant">{label}</span>
        <span className={`font-semibold ${barClass.replace("bg-", "text-")}`}>{value}</span>
      </div>
      <div className="relative h-1.5 w-full rounded-lg bg-surface-container">
        <div className={`h-full rounded-lg ${barClass}`} style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 bg-on-surface"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between font-code-sm text-[10px] text-outline">
        <span>{scale[0]}</span>
        <span>{scale[1]}</span>
      </div>
    </div>
  );
}

const STRATEGY_CARDS: Record<
  AgentConfig["turn_taking_mode"],
  { core: string; coreBody: string; bargeIn: string; bargeInBody: string; backchannel: string; backchannelBody: string }
> = {
  baseline: {
    core: "Fixed silence threshold",
    coreBody:
      "Releases the turn after a set run of VAD silence. No semantic signal — this is the naive arm the project measures against.",
    bargeIn: "Stop on any speech",
    bargeInBody: "Any detected speech during playback halts TTS. No filter sits in front of the stop decision.",
    backchannel: "Not implemented",
    backchannelBody:
      "Backchannels like \"mhm\" and \"yeah\" stop the agent, which is why the baseline's false-stop rate is 100%.",
  },
  smart_turn: {
    core: "Pipecat smart-turn",
    coreBody:
      "The framework's own LocalSmartTurnAnalyzerV3 decides end-of-utterance. Included as the arm worth beating.",
    bargeIn: "Framework default",
    bargeInBody: "Barge-in handling comes from Pipecat's user-turn lifecycle, unmodified.",
    backchannel: "Not implemented",
    backchannelBody: "No separate backchannel filter runs in this arm.",
  },
  semantic: {
    core: "VAD + semantic EOU",
    coreBody:
      "Combines VAD silence with a semantic end-of-utterance signal on the partial transcript before releasing the turn.",
    bargeIn: "Filtered stop",
    bargeInBody: "Speech during playback is checked against the backchannel filter before a stop is issued.",
    backchannel: "Sits in front of stop",
    backchannelBody:
      "A separate filter so it can be tuned and evaluated in isolation from VAD and STT.",
  },
};

export function CallView() {
  const {
    status,
    error,
    muted,
    agentSpeaking,
    micLevel,
    agentLevel,
    config,
    connect,
    disconnect,
    toggleMute,
    agentVolume,
    setAgentVolume,
  } = useSession();

  const connected = status === "connected";
  const userHistory = useLevelHistory(micLevel, connected && !muted);
  const agentHistory = useLevelHistory(agentLevel, connected);
  const userSpeaking = connected && !muted && micLevel > 0.02;
  const cards = STRATEGY_CARDS[config?.turn_taking_mode ?? "baseline"];

  const stageStatus = !connected
    ? status === "connecting"
      ? "CONNECTING TO ROOM"
      : status === "error"
        ? "CONNECTION FAILED"
        : "IDLE • NOT CONNECTED"
    : muted
      ? "MIC MUTED • AGENT STILL AUDIBLE"
      : agentSpeaking
        ? "AGENT SPEAKING"
        : userSpeaking
          ? "USER SPEAKING"
          : "LISTENING";

  const floorLabel = !connected
    ? "No session"
    : agentSpeaking
      ? "Agent output"
      : userSpeaking
        ? "User input"
        : "Open";

  const accent = agentSpeaking ? "primary" : userSpeaking ? "secondary" : "outline";
  const accentText =
    accent === "primary" ? "text-primary" : accent === "secondary" ? "text-secondary" : "text-outline";

  return (
    <div className="flex w-full flex-col">
      {/* Session ribbon */}
      <div className="mb-space-lg flex flex-col items-start justify-between gap-space-md py-space-sm xl:flex-row xl:items-center">
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-lowest px-space-md py-1.5">
            <span className="relative flex h-2 w-2">
              {connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-80" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-primary" : "bg-outline-variant"}`}
              />
            </span>
            <LabelCaps className="text-on-surface-variant">Transport</LabelCaps>
            <span className={`font-code-sm text-code-sm font-medium ${connected ? "text-primary" : "text-outline"}`}>
              {connected ? "LiveKit room joined" : "Not connected"}
            </span>
          </div>
          <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-lowest px-space-md py-1.5">
            <LabelCaps className="text-outline">Echo cancellation</LabelCaps>
            <span className="flex items-center gap-1 font-code-sm text-code-sm font-medium text-on-surface">
              <Icon name="verified" className="text-[14px] text-primary" /> Enabled on capture
            </span>
          </div>
          <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-lowest px-space-md py-1.5">
            <LabelCaps className="text-outline">Pipeline</LabelCaps>
            <span className="font-code-sm text-code-sm font-medium text-secondary">
              {config
                ? `${config.stt_provider} → ${config.llm_provider} → ${config.tts_provider}`
                : "config unavailable"}
            </span>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-space-xs sm:grid-cols-4 xl:w-auto">
          {[
            { label: "Mic RMS", value: connected && !muted ? micLevel.toFixed(3) : "—", cls: "text-secondary" },
            { label: "Agent RMS", value: connected ? agentLevel.toFixed(3) : "—", cls: "text-primary" },
            {
              label: "Silence threshold",
              value: config ? String(config.baseline_silence_ms) : "—",
              unit: "ms",
              cls: "text-on-surface",
            },
            {
              label: "Barge-in deadline",
              value: config ? String(config.barge_in_stop_deadline_ms) : "—",
              unit: "ms",
              cls: "text-primary-fixed-dim",
            },
          ].map((m) => (
            <div key={m.label} className="flex flex-col rounded bg-surface-container-low px-space-md py-1.5">
              <LabelCaps className="text-outline">{m.label}</LabelCaps>
              <div className="flex items-baseline gap-1">
                <span className={`font-metric-display text-headline-sm tabular-nums ${m.cls}`}>{m.value}</span>
                {m.unit && <span className="font-metric-unit text-metric-unit text-outline">{m.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-gutter-desktop xl:grid-cols-12">
        {/* Stage + scope + strategy cards */}
        <div className="flex flex-col gap-space-lg xl:col-span-8">
          <div className="relative flex min-h-[460px] w-full flex-col items-center justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-space-lg shadow-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#4cd7f6_1px,transparent_1px)] opacity-15 [background-size:24px_24px]" />
            <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-secondary/10 blur-3xl" />

            <div className="z-10 flex w-full flex-wrap items-center justify-between gap-space-xs">
              <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high/80 px-space-md py-1 backdrop-blur-md">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    connected ? (agentSpeaking ? "bg-primary" : userSpeaking ? "bg-secondary" : "bg-primary/50") : "bg-outline-variant"
                  } ${connected ? "animate-pulse" : ""}`}
                />
                <span className={`font-code-sm text-[11px] font-semibold uppercase tracking-wider ${accentText}`}>
                  {stageStatus}
                </span>
              </div>
              <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high/80 px-space-md py-1 font-code-sm text-[11px] text-on-surface-variant backdrop-blur-md">
                <span className="text-outline">Floor:</span>
                <span className={`font-medium ${accentText}`}>{floorLabel}</span>
              </div>
            </div>

            {/* Resonating core */}
            <div className="relative z-10 my-space-xl flex h-64 w-64 select-none items-center justify-center">
              {connected && (
                <div
                  className="absolute inset-0 animate-ping rounded-full bg-primary/5"
                  style={{ animationDuration: "3.5s" }}
                />
              )}
              <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-primary/10 via-secondary/10 to-transparent blur-md" />
              <div className="absolute inset-6 flex items-center justify-center rounded-full bg-surface-container-low shadow-[0_0_40px_rgba(76,215,246,0.18)]">
                <svg
                  className="absolute inset-0 h-full w-full animate-[spin_20s_linear_infinite]"
                  viewBox="0 0 200 200"
                >
                  <circle
                    className="text-primary/40"
                    cx="100"
                    cy="100"
                    r="90"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray="3 11"
                    strokeWidth="1.5"
                  />
                  <circle
                    className="text-secondary/30"
                    cx="100"
                    cy="100"
                    r="76"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray="16 8"
                    strokeWidth="1"
                  />
                </svg>
                <div
                  className={`relative flex h-28 w-28 flex-col items-center justify-center rounded-full bg-gradient-to-b transition-all duration-300 ${
                    !connected
                      ? "from-surface-container-high via-surface-container to-surface-container-lowest shadow-none"
                      : userSpeaking
                        ? "from-secondary via-secondary-container to-surface-container-lowest shadow-[inset_0_2px_12px_rgba(255,255,255,0.4),0_0_36px_rgba(255,185,95,0.6)]"
                        : "from-primary via-primary-container to-surface-container-lowest shadow-[inset_0_2px_12px_rgba(255,255,255,0.4),0_0_28px_rgba(76,215,246,0.4)]"
                  }`}
                  style={connected ? { transform: `scale(${1 + Math.min(0.12, micLevel + agentLevel)})` } : undefined}
                >
                  <Icon
                    name={!connected ? "power_settings_new" : muted ? "mic_off" : userSpeaking ? "record_voice_over" : "graphic_eq"}
                    className={`text-[38px] ${connected ? "text-surface-container-lowest" : "text-outline"}`}
                  />
                  <span
                    className={`mt-1 font-label-caps text-[9px] font-bold tracking-widest ${
                      connected ? "text-surface-container-lowest" : "text-outline"
                    }`}
                  >
                    VOX-01
                  </span>
                </div>
              </div>
              <div className="absolute -left-6 top-1/2 h-[1px] w-4 bg-primary/40" />
              <div className="absolute -right-6 top-1/2 h-[1px] w-4 bg-primary/40" />
              <div className="absolute -top-6 left-1/2 h-4 w-[1px] bg-primary/40" />
              <div className="absolute -bottom-6 left-1/2 h-4 w-[1px] bg-primary/40" />
            </div>

            {/* Live input level */}
            <div className="z-10 flex w-full max-w-lg flex-col gap-1.5">
              <div className="flex items-center justify-between font-code-sm text-[11px]">
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <Icon name="graphic_eq" className="text-[14px] text-secondary" />
                  <span>Capture level</span>
                  <span className="text-on-surface font-medium">
                    {connected && !muted ? `${(micLevel * 100).toFixed(1)}% RMS` : muted ? "muted" : "idle"}
                  </span>
                </div>
                <span className="font-semibold text-secondary tabular-nums">
                  {connected && !muted ? `${Math.round(Math.min(1, micLevel * 3) * 100)}%` : "0%"}
                </span>
              </div>
              <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-sm bg-surface-container p-[1px]">
                <div
                  className="h-full rounded-none bg-secondary transition-all duration-75"
                  style={{ width: `${connected && !muted ? Math.min(100, micLevel * 300) : 0}%` }}
                />
                <div className="h-full flex-1 bg-surface-container-highest" />
              </div>
            </div>
          </div>

          {/* Dual-channel oscilloscope */}
          <Panel className="flex w-full flex-col gap-space-sm shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-space-xs pb-space-xs">
              <div className="flex items-center gap-space-md">
                <LabelCaps className="flex items-center gap-1.5 text-on-surface">
                  <Icon name="stacked_line_chart" className="text-[16px] text-primary" />
                  Synchronous dual-channel oscilloscope
                </LabelCaps>
                <span className="font-code-sm text-[11px] text-outline">
                  {SCOPE_SAMPLES} samples · 50ms/div
                </span>
              </div>
              <div className="flex items-center gap-space-md font-code-sm text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-2.5 bg-secondary" />
                  <span className="text-on-surface-variant">User mic (Ch 1)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-2.5 bg-primary" />
                  <span className="text-on-surface-variant">Agent out (Ch 2)</span>
                </span>
                <span className="text-outline-variant">|</span>
                <span
                  className={`flex items-center gap-1 font-medium ${
                    userSpeaking && agentSpeaking ? "text-error" : "text-on-surface-variant"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      userSpeaking && agentSpeaking ? "animate-ping bg-error" : "bg-outline-variant"
                    }`}
                  />
                  {userSpeaking && agentSpeaking ? "Overlap" : "No overlap"}
                </span>
              </div>
            </div>

            <div className="relative flex h-32 w-full flex-col justify-between overflow-hidden rounded-lg bg-surface-container-low p-2">
              <div className="pointer-events-none absolute inset-0 flex justify-between px-4 opacity-20">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className={`h-full w-[1px] ${i === 4 ? "bg-primary" : "bg-outline-variant"}`} />
                ))}
              </div>
              <ScopeTrace history={userHistory} tone="user" />
              <div className="relative h-[1px] w-full bg-outline-variant/60">
                <span className="absolute -top-2 right-2 font-code-sm text-[9px] text-outline">0 dBFS baseline</span>
              </div>
              <ScopeTrace history={agentHistory} tone="agent" />
            </div>

            <div className="flex items-center justify-between px-1 font-code-sm text-[11px] text-on-surface-variant">
              <div className="flex items-center gap-space-sm">
                <span>
                  Window: <strong className="text-on-surface">{SCOPE_SAMPLES * 50}ms</strong>
                </span>
                <span>
                  Source: <strong className="text-on-surface">Web Audio RMS</strong>
                </span>
              </div>
              <span className={connected ? "font-medium text-primary" : "text-outline"}>
                {connected ? "Streaming" : "Standby"}
              </span>
            </div>
          </Panel>

          {/* Active strategy explainer */}
          <div className="grid grid-cols-1 gap-space-sm md:grid-cols-3">
            {[
              { label: "Turn-taking core", title: cards.core, body: cards.coreBody, chip: config?.turn_taking_mode ?? "—" },
              { label: "Barge-in", title: cards.bargeIn, body: cards.bargeInBody, chip: `${config?.barge_in_stop_deadline_ms ?? "—"}ms budget` },
              { label: "Backchannel filter", title: cards.backchannel, body: cards.backchannelBody, chip: "F8" },
            ].map((card) => (
              <Panel key={card.label} className="flex flex-col gap-space-xs shadow-sm">
                <div className="flex items-center justify-between gap-space-xs">
                  <LabelCaps className="text-outline">{card.label}</LabelCaps>
                  <Chip className="bg-primary-container/20 text-primary">{card.chip}</Chip>
                </div>
                <span className="font-headline-sm text-[15px] font-semibold text-on-surface">{card.title}</span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{card.body}</p>
              </Panel>
            ))}
          </div>
        </div>

        {/* Right rail: engine config */}
        <div className="flex flex-col gap-space-md xl:col-span-4">
          <Panel className="flex flex-col gap-space-md shadow-md">
            <PanelHeading
              icon="tune"
              title="Turn engine config"
              badge={<Chip className="bg-surface-variant text-primary">READ-ONLY</Chip>}
            />

            <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container-low p-space-md">
              <div className="flex items-center justify-between">
                <LabelCaps className="text-outline">Selected A/B arm</LabelCaps>
                <span className="font-code-sm text-[11px] font-medium text-primary">
                  {config?.turn_taking_mode ?? "—"}
                </span>
              </div>
              <span className="font-code-lg text-[14px] font-semibold text-on-surface">{cards.core}</span>
              <span className="font-code-sm text-[11px] text-on-surface-variant">
                Set server-side by TURN_TAKING_MODE; the frontend reads it from /config.
              </span>
            </div>

            <div className="flex flex-col gap-space-md pt-space-xs">
              <ParamReadout
                label="Silence yield threshold"
                value={config ? `${config.baseline_silence_ms} ms` : "—"}
                pct={config ? ((config.baseline_silence_ms - 200) / 800) * 100 : 0}
                barClass="bg-primary"
                scale={["Aggressive 200ms", "Patient 1000ms"]}
              />
              <ParamReadout
                label="Barge-in stop deadline"
                value={config ? `${config.barge_in_stop_deadline_ms} ms` : "—"}
                pct={config ? (config.barge_in_stop_deadline_ms / 500) * 100 : 0}
                barClass="bg-secondary"
                scale={["Instant 0ms", "Lax 500ms"]}
              />
              <ParamReadout
                label="Turn tick interval"
                value={config ? `${config.turn_tick_interval_ms} ms` : "—"}
                pct={config ? (config.turn_tick_interval_ms / 200) * 100 : 0}
                barClass="bg-primary-fixed-dim"
                scale={["Fine 0ms", "Coarse 200ms"]}
              />
            </div>

            <div className="flex flex-col gap-space-xs pt-space-xs font-code-sm text-[11px]">
              {[
                { icon: "transcribe", label: "STT model", value: config?.whisper_model, tint: "text-tertiary" },
                { icon: "psychology", label: "LLM model", value: config?.ollama_model, tint: "text-primary" },
                { icon: "volume_up", label: "TTS voice", value: config?.piper_voice, tint: "text-secondary" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded bg-surface-container-low p-space-sm"
                >
                  <span className="flex items-center gap-space-xs text-on-surface">
                    <Icon name={row.icon} className={`text-[18px] ${row.tint}`} />
                    {row.label}
                  </span>
                  <span className="text-on-surface-variant">{row.value ?? "—"}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Call control deck */}
          <Panel className="flex flex-col gap-space-md shadow-md">
            <PanelHeading icon="call" title="Call control" iconClass="text-secondary" />

            <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-space-md py-2">
              <Icon name="volume_up" className="text-[18px] text-outline" />
              <div className="flex flex-1 flex-col">
                <div className="mb-1 flex justify-between font-code-sm text-[10px] text-outline">
                  <span>Agent volume</span>
                  <span className="font-medium text-on-surface tabular-nums">{agentVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={agentVolume}
                  onChange={(e) => setAgentVolume(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-container accent-primary"
                />
              </div>
            </div>

            <div className="flex flex-col gap-space-sm">
              {connected ? (
                <>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="flex items-center justify-center gap-2 rounded-lg bg-surface-container-high px-space-lg py-2.5 font-body-sm text-body-sm font-semibold text-on-surface transition-all hover:bg-surface-bright"
                  >
                    <Icon
                      name={muted ? "mic_off" : "mic"}
                      className={`text-[20px] ${muted ? "text-error" : "text-primary"}`}
                    />
                    {muted ? "Unmute microphone" : "Mute microphone"}
                  </button>
                  <button
                    type="button"
                    onClick={disconnect}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-error px-space-lg py-2.5 font-body-sm text-body-sm font-bold text-on-error transition-all hover:bg-error-container hover:text-on-error-container"
                  >
                    <Icon name="call_end" className="text-[20px]" />
                    Disconnect session
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={connect}
                  disabled={status === "connecting"}
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary px-space-lg py-2.5 font-body-sm text-body-sm font-bold text-on-primary shadow-[0_0_16px_rgba(6,182,212,0.25)] transition-all hover:brightness-110 disabled:opacity-60"
                >
                  <Icon name={status === "connecting" ? "sync" : "call"} className="text-[20px]" />
                  {status === "connecting" ? "Connecting…" : "Connect to agent"}
                </button>
              )}
            </div>

            {error && (
              <div className="rounded bg-error-container px-space-md py-space-sm font-code-sm text-[11px] text-on-error-container">
                {error}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
