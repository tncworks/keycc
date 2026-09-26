"use client";

import { setConfig } from "@/lib/bus";
import { FINISH_OPTIONS } from "@/lib/product";
import { useConfig } from "./useConfig";

/** Chalk / Graphite / Ember — the particle case re-tints as you choose. */
export default function FinishPicker() {
  const { finish } = useConfig();
  const current = FINISH_OPTIONS.find((f) => f.id === finish) ?? FINISH_OPTIONS[0];
  return (
    <div className="flex flex-col items-center">
      <div role="radiogroup" aria-label="Finish" className="flex items-center gap-5">
        {FINISH_OPTIONS.map((f) => {
          const on = f.id === finish;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${f.name} — ${f.note}`}
              onClick={() => setConfig({ finish: f.id })}
              className={`group relative grid size-11 place-items-center rounded-full border transition-colors duration-500 ease-calm ${on ? "border-ink/70" : "border-line hover:border-ink/35"}`}
            >
              <span className="size-7 rounded-full shadow-[inset_0_1px_1px_rgb(255_255_255/0.25),inset_0_-2px_4px_rgb(0_0_0/0.35)]" style={{ background: f.swatch }} />
            </button>
          );
        })}
      </div>
      <p key={current.id} className="swap-in mt-5 text-body text-ink" aria-live="polite">
        {current.name}
        <span className="text-muted"> — {current.note}</span>
        {current.price ? <span className="text-muted"> · +${current.price}</span> : null}
      </p>
    </div>
  );
}
