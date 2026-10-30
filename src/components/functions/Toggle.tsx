import type { ReactNode } from "react";

/** A toolbar button that stays lit while its option is on. */
export function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex items-center rounded-sm px-1.5 py-0.5 ${pressed ? "bg-border text-amber" : "text-muted hover:bg-border hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
