"use client";

import { useSyncExternalStore } from "react";
import { soundStore } from "@/lib/bus";
import { keySynth } from "@/lib/audio";

/** Muted by default; the first click (a user gesture) starts the AudioContext. */
export async function setSound(on: boolean) {
  if (on) await keySynth.enable();
  else keySynth.disable();
  soundStore.set(on);
}

function Glyph({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
      <path d="M2.5 6v4h2.5l3.5 3V3L5 6H2.5Z" strokeLinejoin="round" />
      {on ? (
        <>
          <path d="M11 5.5a3.5 3.5 0 0 1 0 5" />
          <path d="M12.8 3.6a6 6 0 0 1 0 8.8" />
        </>
      ) : (
        <path d="m11 6 3 4m0-4-3 4" />
      )}
    </svg>
  );
}

export default function SoundToggle({ variant = "header" }: { variant?: "header" | "inline" }) {
  const on = useSyncExternalStore(soundStore.subscribe, soundStore.get, () => false);
  const label = on ? "Sound on" : "Sound off";
  if (variant === "inline") {
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => void setSound(!on)}
        className="group inline-flex items-center gap-3 rounded-full border border-line px-5 py-3 text-body text-ink transition-colors duration-500 ease-calm hover:border-ink/40"
      >
        <span className={`relative flex size-2 rounded-full transition-colors duration-500 ${on ? "bg-accent" : "bg-faint"}`} />
        {on ? "Sound on — type to hear it" : "Turn sound on"}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Turn key sounds off" : "Turn key sounds on"}
      onClick={() => void setSound(!on)}
      className="inline-flex items-center gap-2 font-mono text-label uppercase text-muted transition-colors duration-500 ease-calm hover:text-ink"
    >
      <Glyph on={on} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
