import { Heading } from "@/components/ui";
import { FAQ } from "@/lib/product";

export default function Faq() {
  return (
    <section id="faq" data-form="field" className="relative py-[16svh]" aria-labelledby="faq-title">
      <div className="mx-auto grid w-full max-w-[1320px] gap-12 px-6 md:px-10 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-20">
        <Heading id="faq-title" label="Questions" title="Good to know.">
          Anything else, write to us — a person who builds the keyboards will answer.
        </Heading>
        <div data-reveal="" className="border-t border-line [--d:160ms]">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[1.125rem] text-ink transition-colors duration-500 hover:text-ink/80 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="relative size-3 shrink-0">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-ink/70" />
                  <span className="absolute inset-y-0 left-1/2 w-px bg-ink/70 transition-transform duration-500 ease-calm group-open:scale-y-0" />
                </span>
              </summary>
              <p className="max-w-[40rem] pb-7 text-body text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
