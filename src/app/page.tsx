import { StatusBar } from "@/components/StatusBar";
import { Terminal } from "@/components/Terminal";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-3 py-1">
        <span className="font-semibold tracking-widest text-amber">FINTERMINAL</span>
        <span className="text-muted">v0.1</span>
      </header>
      <Terminal />
      <StatusBar />
    </div>
  );
}
