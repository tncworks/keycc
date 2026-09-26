import FinishPicker from "@/components/FinishPicker";
import { Label } from "@/components/ui";

export default function Design() {
  return (
    <section id="design" data-form="layout" className="relative min-h-[130svh]" aria-labelledby="design-title">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center px-6 pt-[22svh] pb-[64svh] text-center md:px-10 md:pt-[24svh]">
        <Label data-reveal="">04 — Design</Label>
        <h2 id="design-title" data-reveal="" className="mt-5 max-w-[16ch] text-headline font-[440] text-ink [--d:80ms]">
          Quiet from every angle.
        </h2>
        <p data-reveal="" className="mt-7 max-w-[32rem] text-lede text-muted [--d:160ms]">
          No lighting, no logos on the keys, no badges. One machined block, a knob that turns like a lens ring, and a single ember key
          to find your way home.
        </p>
        <div data-reveal="" className="mt-10 [--d:240ms]">
          <FinishPicker />
        </div>
      </div>
    </section>
  );
}
