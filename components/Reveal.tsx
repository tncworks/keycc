"use client";

import { useEffect } from "react";

/**
 * Scroll reveals for [data-reveal]. Content is visible without JS: only
 * elements that start below the fold are hidden (then eased in once).
 */
export default function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const vh = window.innerHeight;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.reveal = "in";
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const el of els) {
      if (el.getBoundingClientRect().top > vh * 0.92) {
        el.dataset.reveal = "pending";
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, []);
  return null;
}
