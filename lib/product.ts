/**
 * Product content in one place: the DOM renders it and the engine reads the
 * ids (switch → force curve, finish → particle tint). Placeholder copy.
 */
import type { FinishId, LayoutId, SwitchId } from "./bus";

export const BASE_PRICE = 329;

export const SWITCH_OPTIONS: { id: SwitchId; name: string; feel: string; body: string; stats: [string, string][] }[] = [
  {
    id: "linear",
    name: "Mote Linear",
    feel: "Smooth, top to bottom",
    body: "Nothing between you and the bottom-out: a long-pole stem on a 62 g spring, lubed by hand so the only sound is a low, round thock.",
    stats: [
      ["45 g", "Actuation"],
      ["62 g", "Bottom-out"],
      ["2.0 mm", "Actuation point"],
      ["4.0 mm", "Total travel"],
    ],
  },
  {
    id: "tactile",
    name: "Mote Tactile",
    feel: "A rounded bump, then quiet",
    body: "A soft, early bump tells your finger the key has registered — then the stroke falls away into the same muted bottom-out. No click, ever.",
    stats: [
      ["67 g", "Tactile peak"],
      ["64 g", "Bottom-out"],
      ["0.6 mm", "Bump position"],
      ["4.0 mm", "Total travel"],
    ],
  },
  {
    id: "silent",
    name: "Mote Silent",
    feel: "Dampened at both ends",
    body: "Silicone dampers on the stem soften the top-out and the bottom-out for shared rooms and late nights. A little shorter, a lot quieter.",
    stats: [
      ["45 g", "Actuation"],
      ["58 g", "Bottom-out"],
      ["1.9 mm", "Actuation point"],
      ["3.7 mm", "Total travel"],
    ],
  },
];

export const FINISH_OPTIONS: { id: FinishId; name: string; note: string; swatch: string; price: number }[] = [
  { id: "chalk", name: "Chalk", note: "Bead-blasted, natural anodised", swatch: "#e6dfd3", price: 0 },
  { id: "graphite", name: "Graphite", note: "Deep grey, hard anodised", swatch: "#3b3a39", price: 0 },
  { id: "ember", name: "Ember", note: "Burnt orange, limited to Batch 04", swatch: "#b8663f", price: 20 },
];

export const LAYOUT_OPTIONS: { id: LayoutId; name: string }[] = [
  { id: "ansi", name: "ANSI" },
  { id: "iso", name: "ISO" },
];

export const SPECS: [string, string][] = [
  ["Layout", "75 %, 82 keys + rotary knob · ANSI or ISO"],
  ["Dimensions", "327 × 141 × 32 mm"],
  ["Weight", "1.9 kg, with a 650 g brass weight"],
  ["Case", "CNC-machined 6063 aluminium, anodised"],
  ["Mount", "Gasket, PORON · flex-cut polycarbonate plate"],
  ["PCB", "1.2 mm, hot-swap (3- and 5-pin MX), south-facing"],
  ["Stabilisers", "Screw-in, hand-lubed and clipped"],
  ["Switches", "Mote Linear, Tactile or Silent — lubed by hand"],
  ["Keycaps", "PBT double-shot, Cherry profile, 1.5 mm walls"],
  ["Dampening", "Gasket, case pad, PE sheet, IXPE switch pad, plate foam"],
  ["Connectivity", "USB-C · 2.4 GHz · Bluetooth 5.3 (three devices)"],
  ["Polling rate", "1000 Hz wired and 2.4 GHz"],
  ["Battery", "4000 mAh, up to 200 hours"],
  ["Firmware", "QMK, remappable in the browser with VIA"],
  ["Typing angle", "8°, 19 mm front height"],
  ["Works with", "macOS, Windows, Linux, iPadOS"],
  ["Warranty", "Two years; the case, for life"],
];

export const IN_THE_BOX: { item: string; note: string; icon: "board" | "cable" | "dongle" | "puller" | "switch" | "key" | "caps" | "cover" }[] = [
  { item: "Mote 75", note: "Assembled, tuned, signed", icon: "board" },
  { item: "Coiled cable", note: "USB-C, 1.5 m, aviator connector", icon: "cable" },
  { item: "2.4 GHz receiver", note: "Stored under the magnetic foot", icon: "dongle" },
  { item: "Keycap & switch puller", note: "Stainless steel", icon: "puller" },
  { item: "Four spare switches", note: "Matching your choice", icon: "switch" },
  { item: "Hex key", note: "For the six case screws", icon: "key" },
  { item: "Mac modifiers", note: "⌘ ⌥ ⌃ in PBT", icon: "caps" },
  { item: "Dust cover", note: "Undyed cotton", icon: "cover" },
];

export const REVIEWS: { quote: string; name: string; role: string }[] = [
  { quote: "I stopped noticing the keyboard. That is the highest compliment I know how to give a tool.", name: "Inês M.", role: "Type designer, Lisbon" },
  { quote: "Deep, round, never loud. My partner no longer leaves the room when I have a deadline.", name: "Daniel K.", role: "Software engineer, Berlin" },
  { quote: "Built like a camera body. The knob alone feels like it belongs on a lens.", name: "Priya S.", role: "Writer, London" },
];

export const PROCESS: { step: string; title: string; body: string; time: string }[] = [
  { step: "01", title: "Machined", body: "Each case starts as a solid block of 6063 aluminium and spends four hours on a five-axis mill.", time: "4 h" },
  { step: "02", title: "Finished", body: "Bead-blasted by hand, then anodised in batches of forty so every case in a batch matches.", time: "2 days" },
  { step: "03", title: "Tuned", body: "Every switch opened and lubed, every stabiliser clipped and balanced, every key listened to.", time: "5 h" },
  { step: "04", title: "Signed", body: "Tested key by key, then signed underneath by the person who built it. Their initials ship with it.", time: "1 min" },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "When will my keyboard ship?", a: "Batch 04 is built in February and ships in March 2027. We build in small batches, so reservations are confirmed in the order they arrive." },
  { q: "What does a reservation cost?", a: "Nothing. We'll write before your keyboard is built to confirm your configuration; you only pay when it is ready to ship, and you can cancel any time before." },
  { q: "Does it work with a Mac?", a: "Yes. It switches between macOS and Windows layouts from the keyboard, and Mac modifier keycaps are in the box. Linux and iPadOS work too." },
  { q: "Can I change the switches later?", a: "Yes — the PCB is hot-swap and takes any 3- or 5-pin MX-style switch. No soldering, just the puller in the box." },
  { q: "Is there RGB lighting?", a: "No, on purpose. A single warm LED under Caps Lock and the battery indicator are the only lights — which is also why the battery lasts about 200 hours." },
  { q: "What if something isn't right?", a: "Thirty days to return it for any reason, two years of warranty on the electronics, and the case for life." },
];

export function priceFor(finish: FinishId): number {
  return BASE_PRICE + (FINISH_OPTIONS.find((f) => f.id === finish)?.price ?? 0);
}
