import SwitchPicker from "@/components/SwitchPicker";
import { Heading, Label } from "@/components/ui";

export default function Switches() {
  return (
    <section id="switches" data-form="curve" className="relative flex min-h-[125svh] items-center" aria-labelledby="switches-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 pt-[67svh] pb-24 md:px-10 md:py-40">
        <div className="max-w-[30rem] md:max-w-[24rem] lg:max-w-[28rem] xl:max-w-[30rem]">
          <Heading id="switches-title" label="02 — Switches" title="Choose how it presses.">
            Three switches, each lubed by hand. The curve is how they feel — force against travel, measured on our bench.
          </Heading>
          <div data-reveal="" className="mt-10 [--d:240ms]">
            <SwitchPicker />
          </div>
          <Label data-reveal="" className="mt-10 text-faint [--d:320ms]">
            Press any key — follow your finger down the curve.
          </Label>
        </div>
      </div>
    </section>
  );
}
