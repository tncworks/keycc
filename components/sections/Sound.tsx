import DemoTyper from "@/components/DemoTyper";
import SoundToggle from "@/components/SoundToggle";
import { Heading, Label } from "@/components/ui";

export default function Sound() {
  return (
    <section id="sound" data-form="waveform" className="relative min-h-[125svh]" aria-labelledby="sound-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 pt-[26svh] pb-[62svh] md:px-10 md:pt-[30svh]">
        <div className="max-w-[32rem]">
          <Heading id="sound-title" label="03 — Acoustics" title="Tuned to a lower note.">
            A PORON gasket, a silicone case pad and a thin sheet of PE under the PCB take the hollow ring out of a metal case. What is
            left is low and short: a thock, not a clack.
          </Heading>
          <div data-reveal="" className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3 [--d:240ms]">
            <SoundToggle variant="inline" />
            <DemoTyper />
          </div>
          <Label data-reveal="" className="mt-5 text-faint [--d:300ms]">
            Or type — every key leaves a ridge.
          </Label>
        </div>
      </div>
    </section>
  );
}
