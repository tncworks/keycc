import { ActuationLabel } from "@/components/SwitchPicker";
import { Pin } from "@/components/ui";
import { PARTS } from "./Anatomy";

const tick = "font-mono text-[10px] tracking-[0.12em] text-muted";
const note = (title: string, body: string) => (
  <span className="block text-left">
    <span className="block font-mono text-label uppercase text-ink/85">{title}</span>
    <span className="mt-1 block text-[0.75rem] leading-none text-muted">{body}</span>
  </span>
);

/**
 * Labels that live on the particle forms. One fixed layer; the engine moves
 * each anchor to its projected point every frame and fades it with its form.
 */
export default function PinnedLabels() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {/* exploded switch: a column of callouts with leader lines (md+) */}
      <div className="hidden md:block">
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

      {/* force curve: axis ticks and the actuation point */}
      {[0, 1, 2, 3, 4].map((x) => (
        <Pin key={x} anchor={`curve:x${x}`} side="bottom" className={tick}>
          {x === 4 ? "4 mm" : x}
        </Pin>
      ))}
      {[25, 50, 75].map((y) => (
        <Pin key={y} anchor={`curve:y${y}`} side="left" className={tick}>
          {y} g
        </Pin>
      ))}
      <Pin anchor="curve:act" side="top" lead={34}>
        <ActuationLabel />
      </Pin>

      {/* keyboard from above: details (md+) */}
      <div className="hidden md:block">
        <Pin anchor="layout:esc" side="left" lead={70} dot>
          {note("Esc, in ember", "The one key with a colour")}
        </Pin>
        <Pin anchor="layout:knob" side="right" lead={70} dot>
          {note("Machined knob", "Volume, scrub, anything")}
        </Pin>
        <Pin anchor="layout:space" side="bottom" lead={78} dot>
          {note("Screw-in stabilisers", "Clipped, lubed, balanced")}
        </Pin>
        <Pin anchor="layout:arrows" side="right" lead={120} dot>
          {note("Full arrow cluster", "Nothing hidden behind Fn")}
        </Pin>
      </div>

      {/* coiled cable (md+) */}
      <div className="hidden md:block">
        <Pin anchor="coil:plug" side="top" lead={52} dot>
          {note("USB-C", "Braided, 1.5 m")}
        </Pin>
        <Pin anchor="coil:aviator" side="bottom" lead={56} dot>
          {note("Aviator connector", "Machined, quick-release")}
        </Pin>
      </div>
    </div>
  );
}
