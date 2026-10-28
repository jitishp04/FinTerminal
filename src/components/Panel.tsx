import type { ReactNode } from "react";
import { formatCommand, type Command } from "@/lib/commands";
import { FUNCTION_BY_CODE } from "@/lib/functions";

interface PanelProps {
  index: number;
  command: Command;
  focused: boolean;
  maximized: boolean;
  hidden: boolean;
  onFocus: () => void;
  onToggleMaximize: () => void;
  children: ReactNode;
}

export function Panel({ index, command, focused, maximized, hidden, onFocus, onToggleMaximize, children }: PanelProps) {
  return (
    <section
      aria-label={`Panel ${index + 1}`}
      aria-current={focused || undefined}
      onMouseDown={onFocus}
      className={`flex min-h-0 min-w-0 flex-col bg-background ${focused ? "outline -outline-offset-1 outline-amber" : ""} ${hidden ? "hidden" : ""}`}
    >
      <header className="flex items-center gap-2 border-b border-border bg-panel px-2 py-0.5">
        <span className="text-muted">{index + 1}</span>
        <span className={`font-semibold ${focused ? "text-amber" : ""}`}>{formatCommand(command)}</span>
        <span className="truncate text-muted">{FUNCTION_BY_CODE.get(command.fn)?.title}</span>
        <button
          type="button"
          onClick={onToggleMaximize}
          aria-label={maximized ? "Restore panel" : "Maximize panel"}
          title={maximized ? "Restore" : "Maximize"}
          className="ml-auto text-muted hover:text-foreground"
        >
          {maximized ? "[-]" : "[+]"}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
    </section>
  );
}
