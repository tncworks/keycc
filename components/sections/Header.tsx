import SoundToggle from "@/components/SoundToggle";
import { BRAND } from "@/lib/brand";

const NAV = [
  { href: "#anatomy", label: "Anatomy" },
  { href: "#switches", label: "Switches" },
  { href: "#sound", label: "Sound" },
  { href: "#design", label: "Design" },
  { href: "#specs", label: "Specs" },
  { href: "#faq", label: "FAQ" },
];

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ground via-ground/70 to-transparent" />
      <nav className="relative mx-auto flex h-16 max-w-[1320px] items-center justify-between px-6 md:h-20 md:px-10" aria-label="Primary">
        <a href="#top" className="text-[0.8125rem] font-semibold tracking-[0.34em] text-ink">
          {BRAND.wordmark}
        </a>
        <ul className="hidden items-center gap-8 lg:flex">
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
          <a href="#reserve" className="rounded-full border border-line px-4 py-2 font-mono text-label uppercase text-ink transition-colors duration-500 ease-calm hover:border-ink/40">
            Reserve
          </a>
        </div>
      </nav>
    </header>
  );
}
