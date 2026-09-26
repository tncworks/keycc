import ReserveSummary from "@/components/ReserveSummary";
import { Label } from "@/components/ui";

export default function Reserve() {
  return (
    <section id="reserve" data-form="field" className="relative flex min-h-[100svh] items-center" aria-labelledby="reserve-title">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center px-6 py-32 text-center md:px-10">
        <Label data-reveal="">Batch 04 · ships March 2027</Label>
        <h2 id="reserve-title" data-reveal="" className="mt-5 text-display font-[440] text-ink [--d:80ms]">
          Reserve yours.
        </h2>
        <p data-reveal="" className="mt-7 max-w-[30rem] text-lede text-muted [--d:160ms]">
          Reservations are free. We&rsquo;ll write before your keyboard is built — nothing is charged until it ships.
        </p>
        <div data-reveal="" className="mt-12 flex w-full justify-center [--d:240ms]">
          <ReserveSummary />
        </div>
      </div>
    </section>
  );
}
