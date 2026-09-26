/** Small shared UI atoms (server-safe). */
import type React from "react";

export function Label({ children, className = "", ...rest }: React.HTMLAttributes<HTMLParagraphElement> & { "data-reveal"?: string }) {
  return (
    <p {...rest} className={`font-mono text-label uppercase text-muted ${className}`}>
      {children}
    </p>
  );
}

export function Arrow({ className = "", dir = "down" }: { className?: string; dir?: "down" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`size-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      {dir === "down" ? <path d="M8 3v10M4 9l4 4 4-4" /> : <path d="M3 8h10M9 4l4 4-4 4" />}
    </svg>
  );
}

/** Section heading block: numbered label, headline, lede. */
export function Heading({
  label,
  title,
  id,
  children,
  className = "",
  size = "headline",
}: {
  label: string;
  title: React.ReactNode;
  id: string;
  children?: React.ReactNode;
  className?: string;
  size?: "headline" | "display";
}) {
  return (
    <div className={className}>
      <Label data-reveal="">{label}</Label>
      <h2 id={id} data-reveal="" className={`mt-5 font-[440] text-ink [--d:80ms] ${size === "display" ? "text-display" : "text-headline"}`}>
        {title}
      </h2>
      {children ? (
        <p data-reveal="" className="mt-7 max-w-[30rem] text-lede text-muted [--d:160ms]">
          {children}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A DOM label pinned to a point of a particle form. The engine moves the
 * zero-size anchor to the projected point every frame and fades it with the
 * form; the label sits beside it on `side`.
 */
export function Pin({
  anchor,
  side = "bottom",
  lead = 0,
  dot = false,
  className = "",
  children,
}: {
  anchor: string;
  side?: "top" | "bottom" | "left" | "right";
  lead?: number;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const pos = {
    top: "bottom-0 left-0 -translate-x-1/2 flex-col-reverse items-center",
    bottom: "top-0 left-0 -translate-x-1/2 flex-col items-center",
    left: "right-0 top-0 -translate-y-1/2 flex-row-reverse items-center",
    right: "left-0 top-0 -translate-y-1/2 flex-row items-center",
  }[side];
  const vertical = side === "top" || side === "bottom";
  return (
    <div data-anchor={anchor} className="absolute top-0 left-0 opacity-0 will-change-transform" style={{ transform: "translate3d(-9999px,0,0)" }}>
      {dot ? <span className="absolute -top-[2px] -left-[2px] size-1 rounded-full bg-ink/80" /> : null}
      <div className={`absolute flex whitespace-nowrap ${pos} ${className}`}>
        {lead ? <span className={vertical ? "w-px bg-ink/30" : "h-px bg-ink/30"} style={vertical ? { height: lead } : { width: lead }} /> : null}
        <div className={vertical ? "py-1.5" : "px-2"}>{children}</div>
      </div>
    </div>
  );
}
