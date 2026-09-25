import ParticleStage from "@/components/ParticleStage";
import Reveal from "@/components/Reveal";
import ReserveForm from "@/components/ReserveForm";
import SmoothScroll from "@/components/SmoothScroll";
import SoundToggle from "@/components/SoundToggle";
import TypeHint from "@/components/TypeHint";
import { BRAND } from "@/lib/brand";

const FORMS = ["keyboard", "exploded", "waveform", "wordmark", "field"] as const;

function Label({ children, className = "", ...rest }: React.HTMLAttributes<HTMLParagraphElement> & { "data-reveal"?: string }) {
  return (
    <p {...rest} className={`font-mono text-label uppercase text-muted ${className}`}>
      {children}
    </p>
  );
}

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`size-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v10M4 9l4 4 4-4" />
    </svg>
  );
}

const NAV = [
  { href: "#anatomy", label: "Anatomy" },
  { href: "#sound", label: "Sound" },
  { href: "#studio", label: "Studio" },
  { href: "#lineup", label: "Lineup" },
];

const SPECS = [
  { value: "4.0 mm", label: "Total travel" },
  { value: "62 g", label: "Bottom-out force" },
  { value: "5", label: "Layers of dampening" },
  { value: "8°", label: "Typing angle" },
];

/** The five parts of the exploded switch; labels are pinned to the 3-D model by the engine. */
const PARTS = [
  { id: "keycap", name: "Keycap", note: "PBT, double-shot" },
  { id: "housing", name: "Top housing", note: "Nylon, hand-lubed" },
  { id: "stem", name: "Stem", note: "POM, long pole" },
  { id: "spring", name: "Spring", note: "62 g, two-stage" },
  { id: "base", name: "Base", note: "Polycarbonate" },
];

const LINEUP = [
  {
    name: "Mote 65",
    note: "Compact",
    keys: "67 keys · 65%",
    price: "$289",
    rows: [
      ["Case", "6063 aluminium"],
      ["Mount", "Gasket, PORON"],
      ["Weight", "1.4 kg"],
    ],
  },
  {
    name: "Mote 75",
    note: "The original",
    keys: "82 keys + knob · 75%",
    price: "$329",
    badge: "Batch 04",
    rows: [
      ["Case", "6063 aluminium, brass weight"],
      ["Mount", "Gasket, PORON"],
      ["Weight", "1.9 kg"],
    ],
  },
  {
    name: "Mote TKL",
    note: "Full focus",
    keys: "87 keys · tenkeyless",
    price: "$379",
    rows: [
      ["Case", "6063 aluminium, brass weight"],
      ["Mount", "Top mount, dampened"],
      ["Weight", "2.3 kg"],
    ],
  },
];

export default function Home() {
  return (
    <>
      <ParticleStage forms={[...FORMS]} scrollDriven />
      <SmoothScroll />
      <Reveal />

      {/* ------------------------------------------------------------ header */}
      <header className="fixed inset-x-0 top-0 z-40">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ground via-ground/70 to-transparent" />
        <nav className="relative mx-auto flex h-16 max-w-[1320px] items-center justify-between px-6 md:h-20 md:px-10" aria-label="Primary">
          <a href="#top" className="text-[0.8125rem] font-semibold tracking-[0.34em] text-ink">
            {BRAND.wordmark}
          </a>
          <ul className="hidden items-center gap-9 md:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="font-mono text-label uppercase text-muted transition-colors duration-500 ease-calm hover:text-ink">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-6">
            <SoundToggle />
            <a
              href="#reserve"
              className="rounded-full border border-line px-4 py-2 font-mono text-label uppercase text-ink transition-colors duration-500 ease-calm hover:border-ink/40"
            >
              Reserve
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* -------------------------------------------------------------- hero */}
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
                <p className="text-lede text-muted">
                  A 75% aluminium keyboard, gasket-mounted and tuned by hand for a low, rounded sound.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <a href="#reserve" className="rounded-full bg-ink px-5 py-2.5 text-body font-medium text-ground transition-opacity duration-300 hover:opacity-85">
                    Reserve — from $329
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

        {/* ----------------------------------------------------------- anatomy */}
        <section id="anatomy" data-form="exploded" className="relative flex min-h-[125svh] items-center" aria-labelledby="anatomy-title">
          <div className="mx-auto w-full max-w-[1320px] px-6 pt-[70svh] pb-24 md:px-10 md:py-40">
            <div data-callout-bound className="max-w-[30rem] md:max-w-[22rem] lg:max-w-[26rem] xl:max-w-[30rem]">
              <Label data-reveal="">01 — Anatomy</Label>
              <h2 id="anatomy-title" data-reveal="" className="mt-5 text-headline font-[440] text-ink [--d:80ms]">
                Five parts. Nothing wasted.
              </h2>
              <p data-reveal="" className="mt-7 text-lede text-muted [--d:160ms]">
                Every switch is opened, lubed by hand and closed again before it meets the plate. A long-pole stem on a 62 g spring
                gives each press a soft, rounded bottom-out.
              </p>
              <dl data-reveal="" className="mt-12 grid grid-cols-2 gap-x-10 gap-y-8 border-t border-line pt-8 [--d:240ms]">
                {SPECS.map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="text-title font-[440] text-ink">{s.value}</dd>
                    <dd className="mt-1 font-mono text-label uppercase text-muted">{s.label}</dd>
                  </div>
                ))}
              </dl>
              <p data-reveal="" className="mt-10 font-mono text-label uppercase text-faint [--d:320ms]">
                Press any key — the stem answers.
              </p>
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

        {/* ------------------------------------------------------------- sound */}
        <section id="sound" data-form="waveform" className="relative min-h-[125svh]" aria-labelledby="sound-title">
          <div className="mx-auto w-full max-w-[1320px] px-6 pt-[26svh] pb-[62svh] md:px-10 md:pt-[30svh]">
            <div className="max-w-[32rem]">
              <Label data-reveal="">02 — Acoustics</Label>
              <h2 id="sound-title" data-reveal="" className="mt-5 text-headline font-[440] text-ink [--d:80ms]">
                Tuned to a lower note.
              </h2>
              <p data-reveal="" className="mt-7 max-w-[28rem] text-lede text-muted [--d:160ms]">
                A PORON gasket, a silicone case pad and a thin sheet of PE under the PCB take the hollow ring out of a metal case.
                What is left is low and short: a thock, not a clack.
              </p>
              <div data-reveal="" className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 [--d:240ms]">
                <SoundToggle variant="inline" />
                <Label className="text-faint">Type to see it</Label>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ studio */}
        <section id="studio" data-form="wordmark" className="relative flex min-h-[125svh] flex-col items-center justify-between py-[22svh] text-center" aria-labelledby="studio-title">
          <Label data-reveal="" className="px-6">
            03 — Studio
          </Label>
          <div className="mx-auto max-w-[34rem] px-6 pt-[30svh] md:pt-[26svh]">
            <div className="dissolve-up">
              <h2 id="studio-title" data-reveal="" className="text-title font-[440] text-ink">
                Made slowly, in small numbers.
              </h2>
              <p data-reveal="" className="mt-5 text-lede text-muted [--d:100ms]">
                Machined from a single block of 6063 aluminium, anodised, and assembled by one person in our {BRAND.city} studio. Each board
                carries the initials of the hands that built it.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ lineup */}
        <section id="lineup" data-form="field" className="relative py-[18svh]" aria-labelledby="lineup-title">
          <div className="mx-auto w-full max-w-[1320px] px-6 md:px-10">
            <div className="max-w-[40rem]">
              <Label data-reveal="">04 — Lineup</Label>
              <h2 id="lineup-title" data-reveal="" className="mt-5 text-headline font-[440] text-ink [--d:80ms]">
                Three sizes. One feel.
              </h2>
            </div>
            <ul className="mt-16 grid gap-4 md:mt-20 md:grid-cols-3 md:gap-5">
              {LINEUP.map((p, i) => (
                <li
                  key={p.name}
                  data-reveal=""
                  style={{ ["--d" as string]: `${i * 90}ms` }}
                  className="group relative flex flex-col rounded-2xl border border-line bg-ground/55 p-7 backdrop-blur-md transition-colors duration-700 ease-calm hover:border-ink/25 md:p-8"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-title font-[460] text-ink">{p.name}</h3>
                    {p.badge ? (
                      <span className="inline-flex items-center gap-2 font-mono text-label uppercase text-muted">
                        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                        {p.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-body text-muted">
                    {p.note} · {p.keys}
                  </p>
                  <dl className="mt-8 flex-1 divide-y divide-line border-y border-line">
                    {p.rows.map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-4 py-3">
                        <dt className="font-mono text-label uppercase text-faint">{k}</dt>
                        <dd className="text-right text-body text-ink/85">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-8 flex items-center justify-between">
                    <p className="text-body text-ink">
                      From <span className="font-medium">{p.price}</span>
                    </p>
                    <a href="#reserve" className="font-mono text-label uppercase text-muted transition-colors duration-500 hover:text-ink">
                      Reserve →
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------------------- cta */}
        <section id="reserve" data-form="field" className="relative flex min-h-[90svh] items-center" aria-labelledby="reserve-title">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center px-6 py-32 text-center md:px-10">
            <Label data-reveal="">Batch 04 · ships March 2027</Label>
            <h2 id="reserve-title" data-reveal="" className="mt-5 text-display font-[440] text-ink [--d:80ms]">
              Reserve yours.
            </h2>
            <p data-reveal="" className="mt-7 max-w-[30rem] text-lede text-muted [--d:160ms]">
              Reservations are free. We&rsquo;ll write before your keyboard is built — nothing is charged until it ships.
            </p>
            <div data-reveal="" className="mt-10 flex w-full justify-center [--d:240ms]">
              <ReserveForm />
            </div>
          </div>
        </section>
      </main>

      {/* part labels for the exploded switch: positioned every frame by the engine */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-10 hidden md:block">
        {PARTS.map((p) => (
          <div key={p.id} data-callout={p.id} className="absolute top-0 left-0 flex items-center gap-3 opacity-0 will-change-transform" style={{ transform: "translate3d(-9999px,0,0)" }}>
            <div className="text-right">
              <p className="font-mono text-label uppercase text-ink/85">{p.name}</p>
              <p className="mt-1.5 text-[0.75rem] leading-none text-muted">{p.note}</p>
            </div>
            <span className="h-px w-(--lead,3rem) bg-gradient-to-r from-ink/15 to-ink/50" />
            <span className="-ml-3 size-[3px] rounded-full bg-ink/70" />
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------ footer */}
      <footer className="relative border-t border-line bg-ground/70 backdrop-blur-md">
        <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-x-8 gap-y-12 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10 md:py-20">
          <div className="col-span-2 md:col-span-1">
            <p className="text-[0.8125rem] font-semibold tracking-[0.34em] text-ink">{BRAND.wordmark}</p>
            <p className="mt-4 max-w-[18rem] text-body text-muted">Quiet keyboards, made slowly in {BRAND.city}.</p>
          </div>
          {[
            ["Product", ["Mote 65", "Mote 75", "Mote TKL", "Keycaps"]],
            ["Studio", ["Journal", "About", "Careers"]],
            ["Support", ["Shipping", "Warranty", "Contact"]],
          ].map(([title, links]) => (
            <div key={title as string}>
              <Label>{title}</Label>
              <ul className="mt-5 space-y-3">
                {(links as string[]).map((l) => (
                  <li key={l}>
                    <a href="#top" className="text-body text-ink/75 transition-colors duration-500 hover:text-ink">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 border-t border-line px-6 py-6 font-mono text-label uppercase text-faint sm:flex-row sm:justify-between md:px-10">
          <p>
            © {BRAND.year} {BRAND.studio}
          </p>
          <p>Every image here is made of particles.</p>
        </div>
      </footer>
    </>
  );
}
