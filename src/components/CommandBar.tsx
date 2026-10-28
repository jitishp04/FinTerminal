"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { commandTitle, formatCommand, type Command } from "@/lib/commands";
import { FUNCTION_BY_CODE, FUNCTIONS } from "@/lib/functions";
import { openFunction, suggest } from "@/lib/suggest";

interface Option {
  command: Command;
  /** Heading shown above the first option of each run of the same section. */
  section: string;
}

interface CommandBarProps {
  /** The focused panel, where commands open. */
  panel: number;
  /** The focused panel's command, so a bare "DES" can reuse its ticker. */
  current: Command;
  onRun: (command: Command) => void;
}

/** Search box with a suggestion list (ARIA combobox). Enter opens the highlighted suggestion. */
export function CommandBar({ panel, current, onRun }: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Command[]>([]);

  // Typing anywhere on the page goes to the command bar. Space is left alone so it still presses buttons.
  useEffect(() => {
    function focusOnType(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === " ") return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", focusOnType);
    return () => window.removeEventListener("keydown", focusOnType);
  }, []);

  const typed = value.trim() !== "";
  // With text: suggestions. Empty: recent commands, then every function.
  const options: Option[] = typed
    ? suggest(value, current).map((command) => ({ command, section: "Suggestions" }))
    : [
        ...recent.map((command) => ({ command, section: "Recent" })),
        ...FUNCTIONS.map((fn) => ({ command: openFunction(fn, current.symbol), section: fn.group })),
      ];
  const activeIndex = Math.min(active, options.length - 1);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listId]);

  function reset() {
    setValue("");
    setOpen(false);
    setActive(0);
  }

  function execute(command: Command) {
    onRun(command);
    const key = formatCommand(command);
    setRecent((r) => [command, ...r.filter((c) => formatCommand(c) !== key)].slice(0, 5));
    reset();
  }

  function submit() {
    const chosen = open || typed ? options[activeIndex] : undefined;
    if (chosen) execute(chosen.command);
    // No match: keep the list open, where it explains what to type instead.
    else if (typed) setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
      } else if (options.length > 0) {
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((activeIndex + step + options.length) % options.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      // Nothing to clear: leave Esc to the page, which restores a maximized panel.
      if (!open && !typed) return;
      e.preventDefault();
      reset();
    }
  }

  return (
    <div className="relative max-w-4xl min-w-0 flex-1">
      <div className="flex items-center gap-2 rounded-sm border border-border bg-background px-2 py-1 focus-within:border-amber">
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 4 4" />
        </svg>
        <input
          ref={inputRef}
          data-command-bar
          role="combobox"
          aria-label="Search tickers and functions"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onMouseDown={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder='Search a ticker or a function, e.g. "AAPL chart", "movers", "yield curve"'
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted"
        />
        <span className="shrink-0 rounded-sm bg-border px-1.5 text-xs text-muted" title="Results open in the highlighted panel. Tab switches panels.">
          Panel {panel + 1}
        </span>
        <button
          type="button"
          // Keep focus in the input so the list stays open.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            setOpen(!open);
            setActive(0);
          }}
          aria-label="Browse all functions"
          className="shrink-0 rounded-sm px-1 text-xs text-muted hover:bg-border hover:text-foreground"
        >
          Browse ▾
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-sm border border-border bg-panel shadow-lg shadow-black">
          <ul id={listId} role="listbox" aria-label="Suggestions" className="max-h-[60vh] overflow-y-auto py-1">
            {options.map((option, i) => (
              <Fragment key={`${option.section}-${formatCommand(option.command)}`}>
                {(i === 0 || options[i - 1].section !== option.section) && (
                  <li role="presentation" className="px-3 pt-2 pb-1 text-xs tracking-wider text-muted uppercase">
                    {option.section}
                  </li>
                )}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => execute(option.command)}
                  className={`flex cursor-pointer items-baseline gap-3 px-3 py-1 ${i === activeIndex ? "bg-border" : ""}`}
                >
                  <span className="w-12 shrink-0 font-semibold text-amber">{option.command.fn}</span>
                  <span className="shrink-0">{commandTitle(option.command)}</span>
                  <span className="min-w-0 truncate text-muted">{FUNCTION_BY_CODE.get(option.command.fn)?.description}</span>
                  {i === activeIndex && <span className="ml-auto shrink-0 text-xs text-muted">Enter ↵</span>}
                </li>
              </Fragment>
            ))}
          </ul>
          {options.length === 0 && (
            <p role="status" className="px-3 py-2 text-muted">
              Nothing matches &ldquo;{value.trim()}&rdquo;. Try a ticker like AAPL, or a word like chart or movers.
            </p>
          )}
          <p className="border-t border-border px-3 py-1 text-xs text-muted">
            ↑↓ choose · Enter opens in panel {panel + 1} · Esc closes · Tab switches panel
          </p>
        </div>
      )}
    </div>
  );
}
