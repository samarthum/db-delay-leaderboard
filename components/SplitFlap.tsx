"use client";

export interface SplitFlapProps {
  /** Final text, e.g. "64" or "+18%". One tile per character. */
  text: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Accessible name; defaults to `text`. Tiles are aria-hidden. */
  label?: string;
}

/** STUB: owned by the primitives worker. Departure-board tiles that flip into place on load. */
export function SplitFlap({ text, label }: SplitFlapProps) {
  return <span aria-label={label ?? text}>{text}</span>;
}
