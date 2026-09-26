import { Heading } from "@/components/ui";
import { IN_THE_BOX } from "@/lib/product";

/** Procedural line icons, drawn on a 32-unit grid. */
function Icon({ name }: { name: (typeof IN_THE_BOX)[number]["icon"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    board: (
      <>
        <rect x="3" y="10" width="26" height="12" rx="2" {...common} />
        {Array.from({ length: 18 }, (_, i) => (
          <rect key={i} x={5.5 + (i % 9) * 2.4} y={12.6 + Math.floor(i / 9) * 3} width="1.6" height="1.6" rx="0.3" fill="currentColor" opacity={0.7} />
        ))}
        <rect x="8" y="18.6" width="12" height="1.6" rx="0.3" fill="currentColor" opacity={0.7} />
      </>
    ),
    cable: <path d="M3 22c3 0 3-6 5-6s2 6 4 6 2-6 4-6 2 6 4 6 2-6 4-6h5" {...common} />,
    dongle: (
      <>
        <rect x="9" y="11" width="14" height="10" rx="2" {...common} />
        <path d="M23 14h4v4h-4" {...common} />
      </>
    ),
    puller: <path d="M16 4v8M10 28c0-8 2-14 6-16 4 2 6 8 6 16" {...common} />,
    switch: (
      <>
        <rect x="8" y="8" width="16" height="16" rx="2" {...common} />
        <path d="M16 12v8M12 16h8" {...common} />
      </>
    ),
    key: <path d="M8 6v18a2 2 0 0 0 2 2h14" {...common} />,
    caps: (
      <>
        <rect x="4" y="12" width="7" height="7" rx="1.5" {...common} />
        <rect x="12.5" y="12" width="7" height="7" rx="1.5" {...common} />
        <rect x="21" y="12" width="7" height="7" rx="1.5" {...common} />
      </>
    ),
    cover: <path d="M4 20l6-8h12l6 8v4H4zM10 12l-1 12M22 12l1 12" {...common} />,
  };
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-9 text-ink/80">
      {paths[name]}
    </svg>
  );
}

export default function InTheBox() {
  return (
    <section id="box" data-form="field" className="relative py-[16svh]" aria-labelledby="box-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 md:px-10">
        <Heading id="box-title" label="In the box" title="Everything, and nothing extra." />
        <ul className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4 lg:mt-20">
          {IN_THE_BOX.map((b, i) => (
            <li key={b.item} data-reveal="" style={{ ["--d" as string]: `${(i % 4) * 70}ms` }} className="flex flex-col bg-ground/80 p-6 backdrop-blur-md md:p-7">
              <Icon name={b.icon} />
              <p className="mt-8 text-body text-ink">{b.item}</p>
              <p className="mt-1 text-body text-muted">{b.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
