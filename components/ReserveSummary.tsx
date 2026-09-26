"use client";

import { setConfig } from "@/lib/bus";
import { FINISH_OPTIONS, LAYOUT_OPTIONS, SWITCH_OPTIONS, priceFor } from "@/lib/product";
import ReserveForm from "./ReserveForm";
import { useConfig } from "./useConfig";

/** The configuration chosen along the page, with the layout choice and the form. */
export default function ReserveSummary() {
  const cfg = useConfig();
  const finish = FINISH_OPTIONS.find((f) => f.id === cfg.finish)!;
  const sw = SWITCH_OPTIONS.find((s) => s.id === cfg.switch)!;
  const rows: [string, string, string][] = [
    ["Finish", finish.name, "#design"],
    ["Switches", sw.name.replace("Mote ", ""), "#switches"],
  ];
  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-line bg-ground/55 p-6 text-left backdrop-blur-md sm:p-7">
        <div className="flex items-baseline justify-between">
          <p className="text-title font-[460] text-ink">Your Mote 75</p>
          <p className="text-title font-[440] text-ink">${priceFor(cfg.finish)}</p>
        </div>
        <dl className="mt-6 divide-y divide-line border-y border-line">
          {rows.map(([k, v, href]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-label uppercase text-faint">{k}</dt>
              <dd className="flex items-baseline gap-4 text-body text-ink">
                {v}
                <a href={href} className="font-mono text-label uppercase text-muted transition-colors duration-500 hover:text-ink">
                  Change
                </a>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="font-mono text-label uppercase text-faint">Layout</dt>
            <dd role="radiogroup" aria-label="Layout" className="inline-flex rounded-full border border-line p-0.5">
              {LAYOUT_OPTIONS.map((l) => {
                const on = l.id === cfg.layout;
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setConfig({ layout: l.id })}
                    className={`rounded-full px-3.5 py-1 font-mono text-label uppercase transition-colors duration-500 ${on ? "bg-ink text-ground" : "text-muted hover:text-ink"}`}
                  >
                    {l.name}
                  </button>
                );
              })}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-body text-muted">Free to reserve · pay when it ships · cancel any time</p>
      </div>
      <div className="mt-6">
        <ReserveForm />
      </div>
    </div>
  );
}
