import type { Command } from "@/lib/commands";
import { FUNCTIONS, GROUPS } from "@/lib/functions";
import { openFunction } from "@/lib/suggest";

/** Every function, grouped. Clicking one opens it in this panel. */
export function Help({ onOpen }: { onOpen: (command: Command) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        Click a function to open it here, or type a ticker or a word like &ldquo;chart&rdquo; in the search bar.
      </p>
      {GROUPS.map((group) => (
        <section key={group} aria-label={group}>
          <h3 className="mb-1 text-xs tracking-wider text-muted uppercase">{group}</h3>
          <ul>
            {FUNCTIONS.filter((f) => f.group === group).map((f) => (
              <li key={f.code}>
                <button
                  type="button"
                  onClick={() => onOpen(openFunction(f))}
                  className="flex w-full items-baseline gap-3 rounded-sm px-1 py-0.5 text-left hover:bg-border focus-visible:bg-border focus-visible:outline focus-visible:outline-amber"
                >
                  <span className="w-12 shrink-0 font-semibold text-amber">{f.code}</span>
                  <span className="shrink-0">{f.title}</span>
                  <span className="min-w-0 truncate text-muted">{f.description}</span>
                  <span className="ml-auto shrink-0 text-muted">{f.example}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
