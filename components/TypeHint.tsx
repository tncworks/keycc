"use client";

import { useEffect, useRef, useState } from "react";
import { installKeyboard, keyChannel } from "@/lib/bus";

/**
 * "Type anything" — a quiet invitation with a single keycap that mirrors
 * the last physical key. It only listens; it never captures keys.
 */
export default function TypeHint() {
  const [label, setLabel] = useState("A");
  const [down, setDown] = useState(false);
  const [typed, setTyped] = useState(false);
  const count = useRef(0);

  useEffect(() => {
    const off = installKeyboard();
    const unsub = keyChannel.on((e) => {
      if (e.down) {
        setLabel(e.label.length > 6 ? e.label.slice(0, 6) : e.label);
        setDown(true);
        count.current++;
        if (count.current > 2) setTyped(true);
      } else setDown(false);
    });
    return () => {
      unsub();
      off();
    };
  }, []);

  return (
    <div className="flex items-center gap-3 font-mono text-label uppercase text-muted" aria-hidden>
      <span
        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] border px-2 text-[10px] tracking-[0.08em] normal-case transition-all duration-150 ease-calm ${
          down ? "translate-y-px border-accent/70 text-ink shadow-none" : "border-line text-muted shadow-[0_1px_0_0_rgb(236_230_220/0.14)]"
        }`}
      >
        {label}
      </span>
      <span className="transition-opacity duration-700 [@media(pointer:coarse)]:hidden">{typed ? "Keep going" : "Type, or click a key"}</span>
      <span className="hidden [@media(pointer:coarse)]:inline">Tap a key</span>
    </div>
  );
}
