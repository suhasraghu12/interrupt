// Persistent lab chrome: instrument header (live session readout, active A/B arm) and
// the left rail of research views. Page content renders through the router outlet.

import { NavLink, Outlet } from "react-router-dom";
import { formatElapsed, rmsToDbfs, useSession, type TurnMode } from "../lib/session";
import { Icon, LabelCaps } from "./ui";

const NAV = [
  { to: "/", label: "Voice Call Workspace", end: true },
  { to: "/transcript", label: "Live Transcript & Telemetry", end: false },
  { to: "/latency", label: "Pipeline Latency Waterfall", end: false },
  { to: "/benchmark", label: "Benchmark & Evaluation", end: false },
];

const MODES: { id: TurnMode; short: string; long: string }[] = [
  { id: "baseline", short: "Baseline", long: "Fixed VAD-silence threshold" },
  { id: "smart_turn", short: "Smart-turn", long: "Pipecat LocalSmartTurnAnalyzerV3" },
  { id: "semantic", short: "Semantic", long: "VAD silence + semantic EOU" },
];

const MIC_TICKS = 5;

function MicMeter({ level, active }: { level: number; active: boolean }) {
  const lit = active ? Math.round(Math.min(1, level * 3) * MIC_TICKS) : 0;
  return (
    <div className="flex h-3 w-12 items-end gap-[2px] bg-surface-container px-[1px]">
      {Array.from({ length: MIC_TICKS }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 transition-all duration-75 ${i < lit ? "bg-primary" : "bg-outline-variant"}`}
          style={{ height: `${40 + i * 15}%` }}
        />
      ))}
    </div>
  );
}

function ModeStrip({ active }: { active: TurnMode | null }) {
  return (
    <div className="hidden items-center p-1 rounded bg-surface-container-lowest lg:flex">
      <LabelCaps className="px-space-sm text-outline">Arm</LabelCaps>
      <div className="flex items-center gap-space-xs rounded bg-surface-container-low p-0.5">
        {MODES.map((mode) => {
          const isActive = mode.id === active;
          return (
            <span
              key={mode.id}
              title={`${mode.long} — selected server-side via TURN_TAKING_MODE`}
              className={`rounded px-space-sm py-1 font-code-sm text-[11px] ${
                isActive
                  ? "bg-surface-container-highest text-primary font-medium shadow-[inset_0_0_0_1px_#4cd7f6]"
                  : "text-outline"
              }`}
            >
              {mode.short}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell() {
  const { status, elapsed, micLevel, muted, config, toggleMute, disconnect } = useSession();
  const connected = status === "connected";
  const dbfs = rmsToDbfs(micLevel);

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="fixed inset-x-0 top-0 z-50 bg-surface-container-lowest/95 shadow-[0_1px_8px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <div className="flex h-20 w-full items-center justify-between gap-space-md px-margin-desktop">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 shadow-[inset_0_0_0_1px_rgba(76,215,246,0.4)]">
                <Icon name="graphic_eq" className="text-[20px] text-primary" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-on-surface">
                    Interrupt
                  </span>
                  <span className="rounded bg-surface-variant px-space-xs py-0.5 font-code-sm text-[10px] leading-none text-primary">
                    local
                  </span>
                </div>
                <span className="font-code-sm text-[11px] leading-none text-on-surface-variant">
                  Voice AI Lab &amp; Turn-Taking Engine
                </span>
              </div>
            </div>

            <div className="hidden items-center gap-space-md rounded bg-surface-container-low px-space-md py-space-xs xl:flex">
              <div className="flex items-center gap-space-xs">
                <span className="relative flex h-2 w-2">
                  {connected && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-primary" : "bg-outline-variant"}`}
                  />
                </span>
                <span
                  className={`font-code-sm text-code-sm font-semibold ${connected ? "text-primary" : "text-outline"}`}
                >
                  {connected ? `Session live ${formatElapsed(elapsed)}` : "No active session"}
                </span>
              </div>
              <span className="font-code-sm text-outline-variant">|</span>
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                WebRTC · echo cancellation on
              </span>
              <div className="flex items-center gap-space-xs pl-space-xs">
                <Icon
                  name={muted ? "mic_off" : "mic"}
                  className={`text-[16px] ${muted ? "text-error" : "text-primary"}`}
                />
                <MicMeter level={micLevel} active={connected && !muted} />
                <span className="w-12 font-code-sm text-[10px] tabular-nums text-on-surface-variant">
                  {connected && !muted ? `${dbfs.toFixed(0)}dB` : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-space-md">
            <ModeStrip active={config?.turn_taking_mode ?? null} />
            <div className="flex items-center gap-space-sm">
              <button
                type="button"
                onClick={toggleMute}
                disabled={!connected}
                title={muted ? "Unmute microphone" : "Mute microphone"}
                className="flex items-center gap-1 rounded bg-surface-container-low px-space-sm py-1.5 font-code-sm text-[12px] font-medium text-on-surface transition-all hover:bg-surface-container-high disabled:opacity-40"
              >
                <Icon name={muted ? "mic_off" : "mic"} className="text-[16px]" />
                <span className="hidden md:inline">{muted ? "Unmute" : "Mute"}</span>
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={!connected}
                title="End the session"
                className="flex items-center gap-1 rounded bg-error-container px-space-sm py-1.5 font-code-sm text-[12px] font-medium text-on-error-container transition-all hover:bg-error hover:text-on-error disabled:opacity-40"
              >
                <Icon name="call_end" className="text-[16px]" />
                <span className="hidden md:inline">End</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-20 z-40 hidden w-64 flex-col justify-between bg-surface-container-lowest py-space-lg lg:flex">
        <div className="flex flex-col gap-space-lg">
          <div className="px-margin-desktop">
            <LabelCaps className="text-outline">Research Benchmarks</LabelCaps>
          </div>
          <nav className="flex flex-col gap-1 px-space-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded px-space-md py-2.5 font-body-sm text-body-sm transition-colors ${
                    isActive
                      ? "bg-primary-container font-medium text-on-primary-container"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="px-space-md">
          <div className="flex flex-col gap-space-xs rounded bg-surface-container-low p-space-sm">
            <div className="flex items-center justify-between">
              <LabelCaps className="text-on-surface-variant">Active stack</LabelCaps>
              <span className="font-code-sm text-[11px] text-primary">
                {config?.turn_taking_mode ?? "unknown"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 font-code-sm text-[10px] text-outline">
              <span className="flex justify-between">
                <span>STT</span>
                <span className="text-on-surface-variant">{config?.stt_provider ?? "—"}</span>
              </span>
              <span className="flex justify-between">
                <span>LLM</span>
                <span className="text-on-surface-variant">{config?.llm_provider ?? "—"}</span>
              </span>
              <span className="flex justify-between">
                <span>TTS</span>
                <span className="text-on-surface-variant">{config?.tts_provider ?? "—"}</span>
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <main className="min-h-screen w-full bg-surface px-margin pt-20 md:px-margin-desktop">
          <div className="flex w-full flex-col pb-space-xl pt-space-md">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
