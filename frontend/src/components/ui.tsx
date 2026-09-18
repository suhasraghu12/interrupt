// Small primitives shared by every screen: the icon wrapper, panel chrome and the
// two-tier metric readouts the design system calls for.

import type { ReactNode } from "react";

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

export function LabelCaps({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-label-caps text-label-caps uppercase tracking-wider ${className}`}>{children}</span>
  );
}

export function Panel({
  children,
  className = "",
  tone = "lowest",
}: {
  children: ReactNode;
  className?: string;
  tone?: "lowest" | "low";
}) {
  const bg = tone === "lowest" ? "bg-surface-container-lowest" : "bg-surface-container-low";
  return <div className={`rounded-xl ${bg} p-space-md ${className}`}>{children}</div>;
}

export function PanelHeading({
  icon,
  title,
  badge,
  iconClass = "text-primary",
}: {
  icon: string;
  title: string;
  badge?: ReactNode;
  iconClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-xs">
        <Icon name={icon} className={`text-[20px] ${iconClass}`} />
        <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">{title}</span>
      </div>
      {badge}
    </div>
  );
}

export function Chip({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`px-space-xs py-0.5 rounded font-code-sm text-[10px] leading-normal ${className || "bg-surface-container-high text-primary"}`}
    >
      {children}
    </span>
  );
}

export function Metric({
  label,
  value,
  unit,
  valueClass = "text-on-surface",
  footer,
  icon,
  iconClass = "text-primary",
}: {
  label: string;
  value: string;
  unit?: string;
  valueClass?: string;
  footer?: ReactNode;
  icon?: string;
  iconClass?: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-md">
      <div className="flex items-start justify-between gap-space-xs">
        <LabelCaps className="text-on-surface-variant font-semibold">{label}</LabelCaps>
        {icon && <Icon name={icon} className={`text-[18px] shrink-0 ${iconClass}`} />}
      </div>
      <div className="flex items-baseline gap-space-xs">
        <span className={`font-metric-display text-metric-display font-bold ${valueClass}`}>{value}</span>
        {unit && (
          <span className="font-metric-unit text-metric-unit uppercase text-on-surface-variant">{unit}</span>
        )}
      </div>
      {footer}
    </div>
  );
}

export function Meter({ pct, barClass = "bg-primary", className = "h-1.5" }: { pct: number; barClass?: string; className?: string }) {
  return (
    <div className={`w-full overflow-hidden bg-surface-container ${className}`}>
      <div className={`h-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-space-lg flex flex-col justify-between gap-space-md md:flex-row md:items-end">
      <div>
        <LabelCaps className="text-primary">{eyebrow}</LabelCaps>
        <h1 className="mt-1 font-headline-xl text-headline-xl-mobile font-bold tracking-tight text-on-surface lg:text-headline-xl">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl font-body-sm text-body-sm text-on-surface-variant">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-xs">{actions}</div>}
    </div>
  );
}
