import { Label } from "@/components/ui";
import { REVIEWS } from "@/lib/product";

export default function Reviews() {
  return (
    <section id="reviews" data-form="field" className="relative py-[16svh]" aria-labelledby="reviews-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 md:px-10">
        <Label data-reveal="" id="reviews-title">
          From the desks of Batch 03
        </Label>
        <ul className="mt-12 grid gap-12 md:grid-cols-3 md:gap-10">
          {REVIEWS.map((r, i) => (
            <li key={r.name} data-reveal="" style={{ ["--d" as string]: `${i * 100}ms` }}>
              <figure>
                <blockquote className="text-[1.375rem] leading-[1.35] font-[420] tracking-[-0.012em] text-ink md:text-[1.5rem]">
                  <span className="text-muted">“</span>
                  {r.quote}
                  <span className="text-muted">”</span>
                </blockquote>
                <figcaption className="mt-6 flex items-baseline gap-3">
                  <span className="text-body text-ink">{r.name}</span>
                  <span className="font-mono text-label uppercase text-muted">{r.role}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
