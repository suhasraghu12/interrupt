// Descriptions of the three A/B arms. These are facts about what each arm *is*, not
// measurements of how it performed — results come from the backend.

export type ArmId = "baseline" | "smart_turn" | "semantic";

export interface Arm {
  id: ArmId;
  label: string;
  subtitle: string;
  role: string;
  dot: string;
  text: string;
  bar: string;
}

export const ARMS: Arm[] = [
  {
    id: "semantic",
    label: "Interrupt · Semantic EOU",
    subtitle: "VAD silence + semantic end-of-utterance",
    role: "the contribution",
    dot: "bg-primary",
    text: "text-primary",
    bar: "bg-primary",
  },
  {
    id: "smart_turn",
    label: "Pipecat · LocalSmartTurnAnalyzerV3",
    subtitle: "Framework-default semantic turn detector",
    role: "the framework default to beat",
    dot: "bg-secondary",
    text: "text-secondary",
    bar: "bg-secondary",
  },
  {
    id: "baseline",
    label: "Baseline · Fixed silence threshold",
    subtitle: "Deterministic VAD-silence timer, no semantic signal",
    role: "the naive approach to beat",
    dot: "bg-outline",
    text: "text-outline",
    bar: "bg-outline",
  },
];

export const ARM_BY_ID = Object.fromEntries(ARMS.map((a) => [a.id, a])) as Record<ArmId, Arm>;

/** README success metrics (PRD section 6). Targets, not results. */
export const TARGETS = {
  p50Ms: 600,
  p95Ms: 1000,
  bargeInStopMs: 200,
  falseInterruptionPct: 5,
  missedTurnPct: 10,
  backchannelFalseStopPct: 15,
};

/** Accuracy metrics come from eval/harness.py, which is stubbed pending the week-5
 *  scenario dataset. Listed here so the UI can name what is missing rather than
 *  rendering a blank column. */
export const PENDING_EVAL_METRICS = [
  { key: "false_interruption", label: "False interruption", target: `< ${TARGETS.falseInterruptionPct}%` },
  { key: "missed_turn", label: "Missed turn", target: `< ${TARGETS.missedTurnPct}%` },
  {
    key: "backchannel_false_stop",
    label: "Backchannel false-stop",
    target: `< ${TARGETS.backchannelFalseStopPct}%`,
  },
];
