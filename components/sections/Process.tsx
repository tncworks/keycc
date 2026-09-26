import { Heading } from "@/components/ui";
import { PROCESS } from "@/lib/product";

export default function Process() {
  return (
    <section id="process" data-form="field" className="relative py-[20svh]" aria-labelledby="process-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 md:px-10">
        <Heading id="process-title" label="From block to board" title="Four days, one pair of hands.">
          Every Mote passes through the same four stations in our studio. Nothing is outsourced after the aluminium arrives.
        </Heading>
        <ol className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
          {PROCESS.map((p, i) => (
            <li key={p.step} data-reveal="" style={{ ["--d" as string]: `${i * 90}ms` }} className="flex flex-col bg-ground/80 p-7 backdrop-blur-md md:p-8">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-label uppercase text-faint">{p.step}</span>
                <span className="font-mono text-label uppercase text-muted">{p.time}</span>
              </div>
              <h3 className="mt-10 text-title font-[440] text-ink">{p.title}</h3>
              <p className="mt-3 text-body text-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
