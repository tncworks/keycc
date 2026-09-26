import TypeHint from "@/components/TypeHint";
import { Arrow, Label } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { BASE_PRICE } from "@/lib/product";

export default function Hero() {
  return (
    <section data-form="keyboard" className="relative h-svh min-h-[560px] overflow-hidden" aria-labelledby="hero-title">
      <div className="mx-auto grid h-full max-w-[1320px] grid-rows-[auto_1fr_auto] px-6 pt-[max(6.25rem,13svh)] pb-8 md:px-10 md:pb-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end md:gap-16">
          <div>
            <Label className="rise [--d:250ms]">{BRAND.product} · Mechanical keyboard</Label>
            <h1 id="hero-title" className="rise mt-5 max-w-[11ch] text-hero font-[440] text-ink [--d:420ms]">
              Every keystroke, considered.
            </h1>
          </div>
          <div className="rise max-w-[21rem] [--d:700ms] md:pb-2">
            <p className="text-lede text-muted">A 75% aluminium keyboard, gasket-mounted and tuned by hand for a low, rounded sound.</p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a href="#reserve" className="rounded-full bg-ink px-5 py-2.5 text-body font-medium text-ground transition-opacity duration-300 hover:opacity-85">
                Reserve — from ${BASE_PRICE}
              </a>
              <a href="#anatomy" className="group inline-flex items-center gap-2 text-body text-ink/80 transition-colors duration-500 hover:text-ink">
                Explore the build <Arrow className="transition-transform duration-500 ease-calm group-hover:translate-y-0.5" />
              </a>
            </div>
          </div>
        </div>
        <div />
        <div className="rise grid grid-cols-[1fr_auto_1fr] items-end gap-4 [--d:1600ms]">
          <Label className="hidden sm:block">Scroll</Label>
          <div className="col-start-2">
            <TypeHint />
          </div>
          <Label className="hidden text-right sm:block">Batch 04 · March 2027</Label>
        </div>
      </div>
    </section>
  );
}
