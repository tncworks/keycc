import { Heading } from "@/components/ui";

const LINEUP = [
  {
    name: "Mote 65",
    note: "Compact",
    keys: "67 keys · 65%",
    price: "$289",
    rows: [
      ["Case", "6063 aluminium"],
      ["Mount", "Gasket, PORON"],
      ["Battery", "4000 mAh"],
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
      ["Battery", "4000 mAh"],
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
      ["Battery", "5000 mAh"],
      ["Weight", "2.3 kg"],
    ],
  },
];

export default function Lineup() {
  return (
    <section id="lineup" data-form="field" className="relative py-[16svh]" aria-labelledby="lineup-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 md:px-10">
        <Heading id="lineup-title" label="Lineup" title="Three sizes. One feel." />
        <ul className="mt-16 grid gap-4 md:mt-20 md:grid-cols-3 md:gap-5">
          {LINEUP.map((p, i) => (
            <li
              key={p.name}
              data-reveal=""
              style={{ ["--d" as string]: `${i * 90}ms` }}
              className={`group relative flex flex-col rounded-2xl border bg-ground/60 p-7 backdrop-blur-md transition-colors duration-700 ease-calm hover:border-ink/25 md:p-8 ${p.badge ? "border-ink/20" : "border-line"}`}
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
  );
}
