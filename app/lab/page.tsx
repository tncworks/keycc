import type { Metadata } from "next";
import ParticleStage from "@/components/ParticleStage";

export const metadata: Metadata = {
  title: "Lab — engine prototype",
  robots: { index: false },
};

/** Phase-1 prototype: the engine alone, one form (the keyboard) plus the cursor. */
export default function Lab() {
  return (
    <main className="h-dvh">
      <ParticleStage forms={["keyboard"]} />
      <p className="fixed bottom-6 right-6 font-mono text-label uppercase text-muted">lab · keyboard + cursor · type anything</p>
    </main>
  );
}
