"use client";

import { useEffect, useRef, useState } from "react";
import { Engine } from "@/lib/engine/Engine";
import type { FormName } from "@/lib/engine/forms";

interface Props {
  forms: FormName[];
  scrollDriven?: boolean;
}

/**
 * Mounts the particle engine into one fixed, full-screen layer behind the
 * content. Loaded only on the client (see ParticleStage). The effect is
 * idempotent: Strict Mode's mount → unmount → mount builds, disposes and
 * rebuilds cleanly, and a lost-then-restored context triggers a rebuild.
 */
export default function ParticleCanvas({ forms, scrollDriven = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);
  const formsKey = forms.join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ctrl = new AbortController();
    const search = new URLSearchParams(window.location.search);
    const debug = search.has("debug");
    const shot = search.has("shot");
    let engine: Engine | null = null;
    let unmountDebug: (() => void) | null = null;

    Engine.create({
      host,
      forms: formsKey.split(",") as FormName[],
      seed: Number(search.get("seed") ?? 7) || 7,
      debug,
      shot,
      tier: search.get("tier"),
      scrollDriven,
      signal: ctrl.signal,
    }).then((e) => {
      if (ctrl.signal.aborted) {
        e?.dispose();
        return;
      }
      engine = e;
      document.documentElement.dataset.particles = e ? "on" : "off";
      if (e && debug && !shot) {
        import("@/lib/engine/debug").then(({ mountDebug }) => {
          if (!ctrl.signal.aborted && engine === e) unmountDebug = mountDebug(e);
        });
      }
    });

    const onRestored = () => setGeneration((g) => g + 1);
    window.addEventListener("mote:context-restored", onRestored);
    return () => {
      ctrl.abort();
      window.removeEventListener("mote:context-restored", onRestored);
      unmountDebug?.();
      engine?.dispose();
      engine = null;
    };
  }, [formsKey, scrollDriven, generation]);

  return <div ref={hostRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-lvh w-full" />;
}
