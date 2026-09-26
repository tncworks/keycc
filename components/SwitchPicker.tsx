"use client";

import { setConfig } from "@/lib/bus";
import { SWITCH_OPTIONS } from "@/lib/product";
import { useConfig } from "./useConfig";

/** Linear / Tactile / Silent — the particle force curve reshapes to match. */
export default function SwitchPicker() {
  const { switch: current } = useConfig();
  const sw = SWITCH_OPTIONS.find((s) => s.id === current) ?? SWITCH_OPTIONS[0];
  return (
    <div>
      <div role="radiogroup" aria-label="Switch" className="inline-flex rounded-full border border-line p-1">
        {SWITCH_OPTIONS.map((s) => {
          const on = s.id === current;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setConfig({ switch: s.id })}
              className={`rounded-full px-4 py-2 text-body transition-colors duration-500 ease-calm sm:px-5 ${on ? "bg-ink text-ground" : "text-muted hover:text-ink"}`}
            >
              {s.name.replace("Mote ", "")}
            </button>
          );
        })}
      </div>
      <div key={sw.id} className="swap-in mt-8" aria-live="polite">
        <p className="text-title font-[440] text-ink">{sw.feel}</p>
        <p className="mt-3 max-w-[28rem] text-body text-muted">{sw.body}</p>
        <dl className="mt-8 grid grid-cols-2 gap-x-10 gap-y-6 border-t border-line pt-6 sm:grid-cols-4 sm:gap-x-6">
          {sw.stats.map(([v, l]) => (
            <div key={l}>
              <dt className="sr-only">{l}</dt>
              <dd className="text-title font-[440] text-ink">{v}</dd>
              <dd className="mt-1 font-mono text-label uppercase text-muted">{l}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** The chart's actuation label follows the chosen switch. */
export function ActuationLabel() {
  const { switch: current } = useConfig();
  const act = { linear: "2.0 mm", tactile: "2.0 mm", silent: "1.9 mm" }[current];
  return (
    <span className="font-mono text-label uppercase text-ink/85">
      Actuation <span className="text-accent">·</span> {act}
    </span>
  );
}
