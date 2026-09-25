"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Lenis smooth scrolling for wheel/trackpad. Keyboard scrolling stays
 * native (Lenis syncs to it), and it is off for prefers-reduced-motion and
 * for the deterministic screenshot mode.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.has("shot") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, anchors: { offset: 0 }, autoRaf: true });
    return () => lenis.destroy();
  }, []);
  return null;
}
