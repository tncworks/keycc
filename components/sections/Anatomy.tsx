import { Heading, Label } from "@/components/ui";

const SPECS = [
  { value: "4.0 mm", label: "Total travel" },
  { value: "62 g", label: "Bottom-out force" },
  { value: "5", label: "Layers of dampening" },
  { value: "8°", label: "Typing angle" },
];

/** The five parts of the exploded switch; labels are pinned to the 3-D model by the engine. */
export const PARTS = [
  { id: "keycap", name: "Keycap", note: "PBT, double-shot" },
  { id: "housing", name: "Top housing", note: "Nylon, hand-lubed" },
  { id: "stem", name: "Stem", note: "POM, long pole" },
  { id: "spring", name: "Spring", note: "62 g, two-stage" },
  { id: "base", name: "Base", note: "Polycarbonate" },
];

export default function Anatomy() {
  return (
    <section id="anatomy" data-form="exploded" className="relative flex min-h-[125svh] items-center" aria-labelledby="anatomy-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 pt-[70svh] pb-24 md:px-10 md:py-40">
        <div data-callout-bound className="max-w-[30rem] md:max-w-[22rem] lg:max-w-[26rem] xl:max-w-[30rem]">
          <Heading id="anatomy-title" label="01 — Anatomy" title="Five parts. Nothing wasted.">
            Every switch is opened, lubed by hand and closed again before it meets the plate. A long-pole stem on a 62 g spring gives
            each press a soft, rounded bottom-out.
          </Heading>
          <dl data-reveal="" className="mt-12 grid grid-cols-2 gap-x-10 gap-y-8 border-t border-line pt-8 [--d:240ms]">
            {SPECS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-title font-[440] text-ink">{s.value}</dd>
                <dd className="mt-1 font-mono text-label uppercase text-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
          <Label data-reveal="" className="mt-10 text-faint [--d:320ms]">
            Press any key — the stem answers.
          </Label>
          <ul className="sr-only">
            {PARTS.map((p) => (
              <li key={p.id}>
                {p.name}: {p.note}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
