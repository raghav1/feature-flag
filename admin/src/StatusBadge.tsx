import { CircleCheck, CircleDot, CircleOff } from "lucide-react";
import { STATUS_LABELS, type EnvStatus } from "./audience";

const ICONS = { live: CircleCheck, partial: CircleDot, off: CircleOff } as const;

/** Live / Partial / Off, with an icon so it reads without colour too. */
export function StatusBadge({ status, size = "md", suffix }: { status: EnvStatus; size?: "sm" | "md" | "lg"; suffix?: string }) {
  const Icon = ICONS[status];
  return (
    <span className={`status-badge ${status} ${size}`}>
      <Icon size={size === "lg" ? 18 : size === "sm" ? 12 : 14} aria-hidden="true" />
      {STATUS_LABELS[status]}
      {suffix && <span className="status-suffix">{suffix}</span>}
    </span>
  );
}
