import type { Command } from "@/lib/commands";
import { Help } from "./functions/Help";

export function FunctionView({ command }: { command: Command }) {
  if (command.fn === "HELP") return <Help />;
  return <p className="text-muted">Not built yet.</p>;
}
