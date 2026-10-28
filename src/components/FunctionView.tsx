import { commandTitle, type Command } from "@/lib/commands";
import { FUNCTION_BY_CODE } from "@/lib/functions";
import { Help } from "./functions/Help";

export function FunctionView({ command, onOpen }: { command: Command; onOpen: (command: Command) => void }) {
  if (command.fn === "HELP") return <Help onOpen={onOpen} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="font-semibold">{commandTitle(command)}</p>
      <p className="text-muted">{FUNCTION_BY_CODE.get(command.fn)?.description}</p>
      <p className="mt-3 text-xs text-muted">Coming soon: this panel fills in once its data source is connected.</p>
    </div>
  );
}
