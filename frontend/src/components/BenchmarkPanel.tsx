// F9: the three-arm comparison.
//
// Latency is real: computed from recorded sessions via GET /api/latency/summary. The
// accuracy metrics (false interruption, missed turn, backchannel false-stop) come from
// eval/harness.py, which is stubbed pending the week-5 scenario dataset — those columns
// say so rather than showing a number nothing produced.

import { ARMS, PENDING_EVAL_METRICS, TARGETS, type Arm } from "../lib/arms";
import { formatMs, useApi, type LatencySummary, type ModeSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Chip, Icon, LabelCaps, Metric, PageHeading, Panel } from "./ui";

function Pending({ label = "no eval runs" }: { label?: string }) {
  return <span className="font-code-sm text-[11px] italic text-outline">{label}</span>;
}

function ArmRow({
  arm,
  result,
  isLive,
  best,
}: {
  arm: Arm;
  result: ModeSummary | undefined;
  isLive: boolean;
  best: number | null;
}) {
  const isBest = result != null && best != null && result.p50_ms === best;

  return (
    <tr className={isBest ? "bg-surface-container-high" : "transition-colors hover:bg-surface-container"}>
      <td className="px-space-md py-3">
        <div className="flex items-center gap-space-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${arm.dot} ${isBest ? "shadow-[0_0_8px_#4cd7f6]" : ""}`} />
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className={`font-code-sm text-[13px] font-semibold ${result ? "text-on-surface" : "text-outline"}`}>
                {arm.label}
              </span>
              {isLive && <Chip className="bg-primary-container text-on-primary-container">LIVE ARM</Chip>}
            </div>
            <span className="font-code-sm text-[11px] text-outline">{arm.subtitle}</span>
          </div>
        </div>
      </td>
      <td className="px-space-md py-3">
        {result ? (
          <span className="font-code-sm text-[11px] text-on-surface-variant">
            {result.turns} turn{result.turns === 1 ? "" : "s"} / {result.sessions} session
            {result.sessions === 1 ? "" : "s"}
          </span>
        ) : (
          <Pending label="not run" />
        )}
      </td>
      <td className="px-space-md py-3">
        {result ? (
          <span className={`font-code-lg text-code-lg font-semibold ${isBest ? "text-primary" : "text-on-surface"}`}>
            {formatMs(result.p50_ms)}
          </span>
        ) : (
          <Pending label="—" />
        )}
      </td>
      <td className="px-space-md py-3">
        {result ? (
          <span className="font-code-lg text-code-lg text-on-surface-variant">{formatMs(result.p95_ms)}</span>
        ) : (
          <Pending label="—" />
        )}
      </td>
      <td className="px-space-md py-3">
        {result?.turn_taking_p50_ms != null ? (
          <span className="font-code-sm text-code-sm text-secondary">
            {formatMs(result.turn_taking_p50_ms)}
          </span>
        ) : (
          <Pending label="—" />
        )}
      </td>
      {PENDING_EVAL_METRICS.map((m) => (
        <td key={m.key} className="px-space-md py-3">
          <Pending />
        </td>
      ))}
    </tr>
  );
}

export function BenchmarkPanel() {
  const { config } = useSession();
  const summary = useApi<LatencySummary>("/latency/summary");
  const byMode = new Map((summary.data?.modes ?? []).map((m) => [m.turn_taking_mode, m]));
  const measured = ARMS.filter((a) => byMode.has(a.id));
  const best = measured.length ? Math.min(...measured.map((a) => byMode.get(a.id)!.p50_ms)) : null;
  const pooled = summary.data;

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-col justify-between gap-space-md py-space-md xl:flex-row xl:items-center">
        <div className="flex items-center gap-space-sm">
          <div className="flex items-center justify-center rounded bg-surface-container-high p-2 text-primary">
            <Icon name="equalizer" className="text-[20px]" />
          </div>
          <div className="flex flex-col">
            <LabelCaps className="text-outline">Evaluation engine</LabelCaps>
            <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">
              Turn-Taking Strategy Benchmarking Suite
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center gap-space-xs rounded bg-surface-container-low px-space-md py-2 font-code-sm text-code-sm">
            <LabelCaps className="text-outline">Measured arms</LabelCaps>
            <span className="font-semibold text-primary">
              {measured.length} / {ARMS.length}
            </span>
          </div>
          <a
            href="/api/latency/summary"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-space-xs rounded bg-surface-container-high px-space-md py-2 font-code-sm text-code-sm text-on-surface transition-colors hover:bg-surface-bright"
          >
            <Icon name="download" className="text-[18px]" />
            <span>Raw metrics JSON</span>
          </a>
        </div>
      </div>

      <PageHeading
        eyebrow="Head-to-head"
        title="Benchmark & Evaluation"
        description="Beating the naive baseline is easy. The claim worth publishing is beating the framework's own turn detector on a published eval set — and if ours loses, that is a result too."
      />

      <div className="mb-space-lg grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Pooled p50"
          value={formatMs(pooled?.p50_ms ?? null)}
          valueClass="text-primary"
          icon="timer"
          footer={
            <span className="font-code-sm text-[10px] text-outline">
              target &lt; {TARGETS.p50Ms}ms · {pooled?.total_turns ?? 0} turns recorded
            </span>
          }
        />
        <Metric
          label="Pooled p95"
          value={formatMs(pooled?.p95_ms ?? null)}
          valueClass="text-secondary"
          icon="bolt"
          iconClass="text-secondary"
          footer={<span className="font-code-sm text-[10px] text-outline">target &lt; {TARGETS.p95Ms}ms</span>}
        />
        <Metric
          label="False interruption"
          value="—"
          valueClass="text-outline"
          icon="mic_off"
          iconClass="text-outline"
          footer={
            <span className="font-code-sm text-[10px] text-outline">
              needs eval harness · target &lt; {TARGETS.falseInterruptionPct}%
            </span>
          }
        />
        <Metric
          label="Backchannel false-stop"
          value="—"
          valueClass="text-outline"
          icon="interpreter_mode"
          iconClass="text-outline"
          footer={
            <span className="font-code-sm text-[10px] text-outline">
              needs eval harness · target &lt; {TARGETS.backchannelFalseStopPct}%
            </span>
          }
        />
      </div>

      <Panel tone="low" className="mb-space-lg rounded shadow-sm">
        <div className="mb-space-sm flex flex-wrap items-center justify-between gap-space-sm pb-space-sm">
          <div className="flex items-center gap-space-xs">
            <Icon name="table_chart" className="text-[20px] text-primary" />
            <h2 className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">
              Comparative metrics matrix
            </h2>
          </div>
          <span className="font-code-sm text-[11px] text-on-surface-variant">
            {summary.loading
              ? "loading…"
              : summary.error
                ? `error: ${summary.error}`
                : "latency from recorded sessions · accuracy pending eval harness"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-code-sm">
            <thead>
              <tr className="bg-surface-container-highest font-label-caps text-label-caps uppercase tracking-wider text-outline">
                <th className="rounded-l px-space-md py-2.5">Arm</th>
                <th className="px-space-md py-2.5">Coverage</th>
                <th className="px-space-md py-2.5">p50</th>
                <th className="px-space-md py-2.5">p95</th>
                <th className="px-space-md py-2.5">Turn-taking cost</th>
                {PENDING_EVAL_METRICS.map((m) => (
                  <th key={m.key} className="px-space-md py-2.5 last:rounded-r">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ARMS.map((arm) => (
                <ArmRow
                  key={arm.id}
                  arm={arm}
                  result={byMode.get(arm.id)}
                  isLive={config?.turn_taking_mode === arm.id}
                  best={best}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-space-md flex flex-wrap items-start gap-space-xs rounded bg-surface-container px-space-md py-space-sm font-code-sm text-[11px] text-on-surface-variant">
          <Icon name="info" className="text-[14px] text-secondary" />
          <span className="flex-1">
            Latency columns are measured from whatever has actually been recorded, so an arm with no sessions
            reads "not run" rather than zero. Accuracy columns stay empty until{" "}
            <code className="text-primary">eval/harness.py</code> replays a labelled scenario set through each
            strategy — that is the week-5 deliverable.
          </span>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
        <Panel tone="low" className="flex flex-col gap-space-md rounded lg:col-span-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <Icon name="stacked_bar_chart" className="text-[18px] text-primary" />
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Measured latency by arm
              </h3>
            </div>
            <LabelCaps className="text-outline">p50 / p95</LabelCaps>
          </div>

          {measured.length === 0 ? (
            <p className="rounded bg-surface-container p-space-md font-body-sm text-body-sm text-on-surface-variant">
              No arm has recorded turns yet. Run a conversation with{" "}
              <code className="text-primary">TURN_TAKING_MODE</code> set to each arm in turn, and the bars fill
              in as sessions land in <code className="text-primary">sessions/</code>.
            </p>
          ) : (
            <div className="flex flex-col gap-space-md">
              {(() => {
                const scale = Math.max(...measured.map((a) => byMode.get(a.id)!.p95_ms)) || 1;
                return measured.map((arm) => {
                  const r = byMode.get(arm.id)!;
                  return (
                    <div key={arm.id} className="flex flex-col gap-space-xs">
                      <div className="flex items-center justify-between font-code-sm text-[11px]">
                        <span className="flex items-center gap-space-xs">
                          <span className={`h-2 w-2 rounded-full ${arm.dot}`} />
                          <span className="font-semibold text-on-surface">{arm.label}</span>
                        </span>
                        <span className={arm.text}>
                          {formatMs(r.p50_ms)} / {formatMs(r.p95_ms)}
                        </span>
                      </div>
                      <div className="relative h-5 w-full overflow-hidden rounded bg-surface-container-lowest">
                        <div
                          className={`absolute inset-y-0 left-0 ${arm.bar} opacity-30`}
                          style={{ width: `${(r.p95_ms / scale) * 100}%` }}
                          title={`p95 ${formatMs(r.p95_ms)}`}
                        />
                        <div
                          className={`absolute inset-y-0 left-0 ${arm.bar}`}
                          style={{ width: `${(r.p50_ms / scale) * 100}%` }}
                          title={`p50 ${formatMs(r.p50_ms)}`}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          <div className="flex items-center justify-between rounded bg-surface-container px-space-sm py-1.5 font-code-sm text-[11px]">
            <span className="text-on-surface">
              Solid bar is p50, translucent extent is p95.
            </span>
            <LabelCaps className="text-outline">lower is better</LabelCaps>
          </div>
        </Panel>

        <Panel tone="low" className="flex flex-col gap-space-md rounded lg:col-span-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <Icon name="checklist" className="text-[18px] text-primary" />
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                What each arm is for
              </h3>
            </div>
            <LabelCaps className="text-outline">three-way A/B</LabelCaps>
          </div>

          <div className="flex flex-col gap-space-sm">
            {ARMS.map((arm) => {
              const r = byMode.get(arm.id);
              return (
                <div key={arm.id} className="flex flex-col gap-space-xs rounded bg-surface-container p-space-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-space-xs">
                      <span className={`h-2 w-2 rounded-full ${arm.dot}`} />
                      <span className="font-code-sm text-[12px] font-semibold text-on-surface">{arm.label}</span>
                    </span>
                    <Chip
                      className={
                        r ? "bg-primary-container/20 text-primary" : "bg-surface-container-high text-outline"
                      }
                    >
                      {r ? `${r.turns} turns` : "not run"}
                    </Chip>
                  </div>
                  <span className="font-code-sm text-[11px] text-on-surface-variant">{arm.role}</span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-space-xs rounded bg-surface-container-lowest p-space-sm">
            <LabelCaps className="text-outline">Pending eval metrics</LabelCaps>
            {PENDING_EVAL_METRICS.map((m) => (
              <div
                key={m.key}
                className="flex items-center justify-between font-code-sm text-[11px] text-on-surface-variant"
              >
                <span>{m.label}</span>
                <span className="text-outline">target {m.target}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
