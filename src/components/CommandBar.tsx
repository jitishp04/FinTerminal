"use client";

import { useEffect, useRef, useState } from "react";
import { parseCommand, type Command } from "@/lib/commands";

export function CommandBar({ panel, onRun }: { panel: number; onRun: (command: Command) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  // Typing anywhere on the page goes to the command bar.
  useEffect(() => {
    function focusOnType(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", focusOnType);
    return () => window.removeEventListener("keydown", focusOnType);
  }, []);

  function reset(next = "") {
    setValue(next);
    setError(null);
    setHistoryIndex(null);
  }

  function run() {
    const result = parseCommand(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onRun(result.command);
    setHistory((h) => [...h, value.trim().toUpperCase()]);
    reset();
  }

  function recall(index: number | null) {
    setHistoryIndex(index);
    setValue(index === null ? "" : history[index]);
    setError(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      run();
    } else if (e.key === "Escape") {
      reset();
    } else if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      recall(historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1));
    } else if (e.key === "ArrowDown" && historyIndex !== null) {
      e.preventDefault();
      recall(historyIndex + 1 < history.length ? historyIndex + 1 : null);
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1">
      <span className="text-amber" title={`Runs in panel ${panel + 1}`}>
        {panel + 1}&gt;
      </span>
      <input
        ref={inputRef}
        data-command-bar
        aria-label={`Command for panel ${panel + 1}`}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        placeholder="AAPL GP · WEI · ECO UNRATE · HELP"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className="flex-1 bg-transparent uppercase text-foreground outline-none placeholder:normal-case placeholder:text-muted"
      />
      {error && (
        <span role="alert" className="text-down">
          {error}
        </span>
      )}
    </div>
  );
}
