"use client";

import { useState } from "react";
import type { Command } from "@/lib/commands";
import { CommandBar } from "./CommandBar";
import { FunctionView } from "./FunctionView";

export function Terminal() {
  const [command, setCommand] = useState<Command>({ fn: "HELP", args: [] });

  return (
    <>
      <CommandBar onRun={setCommand} />
      <main className="flex-1 overflow-auto p-3">
        <FunctionView command={command} />
      </main>
    </>
  );
}
