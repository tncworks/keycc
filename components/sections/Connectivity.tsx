import { Heading, Label } from "@/components/ui";

const STATS: [string, string][] = [
  ["USB-C", "1000 Hz, wired"],
  ["2.4 GHz", "1000 Hz, wireless"],
  ["Bluetooth 5.3", "Three devices"],
  ["200 h", "Battery, 4000 mAh"],
  ["QMK · VIA", "Remap in the browser"],
];

export default function Connectivity() {
  return (
    <section id="connectivity" data-form="coil" className="relative min-h-[125svh]" aria-labelledby="connectivity-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 pt-[58svh] pb-[30svh] md:px-10 md:pt-[24svh] md:pb-[60svh]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,30rem)_1fr] lg:items-end lg:gap-20">
          <Heading id="connectivity-title" label="05 — Connectivity" title="Wired, wireless, yours.">
            Plug in the coiled cable and play at 1000 Hz, or cut the cord: 2.4 GHz for work, Bluetooth for everything else. With no
            backlight to feed, the battery lasts for weeks.
          </Heading>
          <dl data-reveal="" className="grid grid-cols-2 gap-x-8 gap-y-7 border-t border-line pt-8 sm:grid-cols-3 [--d:240ms] lg:border-t-0 lg:pt-0">
            {STATS.map(([v, l]) => (
              <div key={v}>
                <dt className="sr-only">{l}</dt>
                <dd className="text-title font-[440] text-ink">{v}</dd>
                <dd className="mt-1 font-mono text-label uppercase text-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Label data-reveal="" className="mt-10 text-faint [--d:320ms]">
          Type — watch each key travel down the cable.
        </Label>
      </div>
    </section>
  );
}
