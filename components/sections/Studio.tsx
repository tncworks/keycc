import { Label } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export default function Studio() {
  return (
    <section id="studio" data-form="wordmark" className="relative flex min-h-[125svh] flex-col items-center justify-between py-[22svh] text-center" aria-labelledby="studio-title">
      <Label data-reveal="" className="px-6">
        06 — Studio
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
  );
}
