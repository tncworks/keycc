import { Heading } from "@/components/ui";
import { SPECS } from "@/lib/product";

export default function Specs() {
  const half = Math.ceil(SPECS.length / 2);
  const cols = [SPECS.slice(0, half), SPECS.slice(half)];
  return (
    <section id="specs" data-form="field" className="relative py-[16svh]" aria-labelledby="specs-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 md:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-20">
          <Heading id="specs-title" label="Mote 75" title="Specifications">
            Everything we measured, in one place.
          </Heading>
          <div data-reveal="" className="grid gap-x-12 md:grid-cols-2 [--d:160ms]">
            {cols.map((col, ci) => (
              <dl key={ci} className={`divide-y divide-line border-line ${ci === 1 ? "md:border-t" : "border-t"}`}>
                {col.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-4 py-4">
                    <dt className="pt-0.5 font-mono text-label uppercase text-faint">{k}</dt>
                    <dd className="text-body text-ink/90">{v}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
