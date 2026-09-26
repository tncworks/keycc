"use client";

import { useEffect, useRef, useState } from "react";
import { keyChannel } from "@/lib/bus";
import { KEYS, keyIndexForCode } from "@/lib/engine/layout75";

const SENTENCE = "quiet keys, loud ideas.";

function codeFor(ch: string): string | null {
  if (/[a-z]/.test(ch)) return `Key${ch.toUpperCase()}`;
  return { " ": "Space", ",": "Comma", ".": "Period" }[ch] ?? null;
}

/**
 * Types a short sentence through the shared key channel at a human cadence,
 * so visitors without a keyboard (phones) can see — and, with sound on,
 * hear — the ridgeline answer.
 */
export default function DemoTyper() {
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);

  const stop = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setPlaying(false);
  };
  useEffect(() => stop, []);

  const play = () => {
    if (playing) return stop();
    setPlaying(true);
    let t = 0;
    [...SENTENCE].forEach((ch, i) => {
      const code = codeFor(ch);
      t += 95 + ((i * 37) % 70) + (ch === " " ? 60 : 0);
      if (!code) return;
      const index = keyIndexForCode(code);
      const label = index >= 0 ? KEYS[index].label : ch;
      timers.current.push(window.setTimeout(() => keyChannel.emit({ code, index, label, down: true, repeat: false, time: performance.now() }), t));
      timers.current.push(window.setTimeout(() => keyChannel.emit({ code, index, label, down: false, repeat: false, time: performance.now() }), t + 70));
    });
    timers.current.push(window.setTimeout(() => setPlaying(false), t + 400));
  };

  return (
    <button
      type="button"
      onClick={play}
      aria-pressed={playing}
      className="group inline-flex items-center gap-3 rounded-full border border-line px-5 py-3 text-body text-ink transition-colors duration-500 ease-calm hover:border-ink/40"
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="currentColor">
        {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M5 3.5v9l7-4.5z" />}
      </svg>
      {playing ? "Typing…" : "Play a sentence"}
    </button>
  );
}
