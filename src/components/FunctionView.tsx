import type { Command } from "@/lib/commands";
import { FUNCTION_BY_CODE } from "@/lib/functions";
import { Help } from "./functions/Help";

export function FunctionView({ command }: { command: Command }) {
  if (command.fn === "HELP") return <Help />;

  const title = FUNCTION_BY_CODE.get(command.fn)?.title;
  const label = [command.symbol, command.fn, ...command.args].filter(Boolean).join(" ");
  return (
    <p className="text-muted">
      <span className="text-amber">{label}</span> · {title}: not built yet.
    </p>
  );
}
