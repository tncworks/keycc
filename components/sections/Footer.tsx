import { Label } from "@/components/ui";
import { BRAND } from "@/lib/brand";

const COLS: [string, string[]][] = [
  ["Product", ["Mote 65", "Mote 75", "Mote TKL", "Keycaps", "Switches"]],
  ["Studio", ["Journal", "About", "Careers", "Press"]],
  ["Support", ["Shipping", "Warranty", "Firmware", "Contact"]],
];

export default function Footer() {
  return (
    <footer className="relative border-t border-line bg-ground/70 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-x-8 gap-y-12 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10 md:py-20">
        <div className="col-span-2 md:col-span-1">
          <p className="text-[0.8125rem] font-semibold tracking-[0.34em] text-ink">{BRAND.wordmark}</p>
          <p className="mt-4 max-w-[18rem] text-body text-muted">Quiet keyboards, made slowly in {BRAND.city}.</p>
        </div>
        {COLS.map(([title, links]) => (
          <div key={title}>
            <Label>{title}</Label>
            <ul className="mt-5 space-y-3">
              {links.map((l) => (
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
  );
}
