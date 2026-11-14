import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** An empty state that says what's missing and what to do next, after GitHub's blankslate. */
export function Blankslate({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="blankslate">
      <Icon size={24} aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
