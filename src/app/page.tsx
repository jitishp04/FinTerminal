import { StatusBar } from "@/components/StatusBar";
import { Terminal } from "@/components/Terminal";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <Terminal />
      <StatusBar />
    </div>
  );
}
