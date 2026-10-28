"use client";

import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
import type { Command } from "@/lib/commands";
import { PANEL_COUNT, parseLayout, serializeLayout, type Layout } from "@/lib/layout";
import { getLayoutSnapshot, getServerLayoutSnapshot, saveLayout, subscribeLayout } from "@/lib/layoutStore";
import { CommandBar } from "./CommandBar";
import { FunctionView } from "./FunctionView";
import { Panel } from "./Panel";

export function Terminal() {
  const raw = useSyncExternalStore(subscribeLayout, getLayoutSnapshot, getServerLayoutSnapshot);
  const layout = useMemo(() => parseLayout(raw), [raw]);
  const [maximized, setMaximized] = useState<number | null>(null);

  const save = (next: Layout) => saveLayout(serializeLayout(next));

  /** Shows `command` in panel `index` and focuses that panel. */
  function open(index: number, command: Command) {
    save({ panels: layout.panels.map((p, i) => (i === index ? command : p)), focused: index });
  }

  function focus(index: number) {
    if (index !== layout.focused) save({ ...layout, focused: index });
    // While a panel is maximized, moving focus shows the newly focused panel instead.
    if (maximized !== null) setMaximized(index);
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // Esc restores a maximized panel, unless the command bar already used it to clear itself.
    if (e.key === "Escape" && !e.defaultPrevented && maximized !== null) {
      setMaximized(null);
      return;
    }
    // Tab / Shift+Tab cycle the focused panel, except inside other form fields.
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest("input:not([data-command-bar]), textarea, select, [contenteditable]")) return;
    e.preventDefault();
    focus((layout.focused + (e.shiftKey ? PANEL_COUNT - 1 : 1)) % PANEL_COUNT);
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border bg-panel px-3 py-1.5">
        <h1 className="shrink-0 font-semibold tracking-widest text-amber">FINTERMINAL</h1>
        <CommandBar
          panel={layout.focused}
          current={layout.panels[layout.focused]}
          onRun={(command) => open(layout.focused, command)}
        />
      </header>
      <main
        className={`grid min-h-0 flex-1 gap-px bg-border ${maximized === null ? "grid-cols-1 grid-rows-4 md:grid-cols-2 md:grid-rows-2" : "grid-cols-1 grid-rows-1"}`}
      >
        {layout.panels.map((command, i) => (
          <Panel
            key={i}
            index={i}
            command={command}
            focused={i === layout.focused}
            maximized={maximized === i}
            hidden={maximized !== null && maximized !== i}
            onFocus={() => focus(i)}
            onToggleMaximize={() => setMaximized(maximized === i ? null : i)}
          >
            <FunctionView command={command} onOpen={(next) => open(i, next)} />
          </Panel>
        ))}
      </main>
    </>
  );
}
