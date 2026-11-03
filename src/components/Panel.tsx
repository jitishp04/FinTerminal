import type { ReactNode } from "react";
import { commandTitle, formatCommand, type Command } from "@/lib/commands";

interface PanelProps {
  index: number;
  command: Command;
  /** What the panel showed before, which Back returns to. */
  previous?: Command;
  focused: boolean;
  maximized: boolean;
  hidden: boolean;
  onFocus: () => void;
  onBack: () => void;
  onToggleMaximize: () => void;
  children: ReactNode;
}

export function Panel({ index, command, previous, focused, maximized, hidden, onFocus, onBack, onToggleMaximize, children }: PanelProps) {
  const toggleLabel = maximized ? "Restore panel (Esc)" : "Maximize panel";
  const backLabel = previous && `Back to ${commandTitle(previous)} (Backspace)`;
  return (
    <section
      aria-label={`Panel ${index + 1}: ${commandTitle(command)}`}
      aria-current={focused || undefined}
      onMouseDown={onFocus}
      className={`flex min-h-0 min-w-0 flex-col bg-background ${focused ? "outline -outline-offset-1 outline-amber" : ""} ${hidden ? "hidden" : ""}`}
    >
      <header
        onDoubleClick={onToggleMaximize}
        className="flex items-center gap-2 border-b border-border bg-panel px-2 py-1 select-none"
      >
        <span
          aria-hidden
          className={`flex size-4 shrink-0 items-center justify-center rounded-sm text-xs ${focused ? "bg-amber text-background" : "bg-border text-muted"}`}
        >
          {index + 1}
        </span>
        {previous && (
          <button
            type="button"
            onClick={onBack}
            // Keeps a quick second click from also maximizing the panel.
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={backLabel}
            title={backLabel}
            className="-mx-1 shrink-0 rounded-sm p-1 text-muted hover:bg-border hover:text-foreground"
          >
            <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 6H1.5M5.5 2 1.5 6l4 4" />
            </svg>
          </button>
        )}
        <h2 className={`truncate font-semibold ${focused ? "text-foreground" : "text-muted"}`}>{commandTitle(command)}</h2>
        <span className="shrink-0 text-xs text-muted">{formatCommand(command)}</span>
        <button
          type="button"
          onClick={onToggleMaximize}
          // A double-click on the button already toggles twice; keep the header from toggling a third time.
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="ml-auto rounded-sm p-1 text-muted hover:bg-border hover:text-foreground"
        >
          <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d={maximized ? "M11 5H7V1M1 7h4v4M7 5l4-4M5 7l-4 4" : "M7 1h4v4M5 11H1V7M11 1 7 5M1 11l4-4"} />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
    </section>
  );
}
