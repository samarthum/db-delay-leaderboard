"use client";

import type { ReactNode } from "react";
import { useArmedUntilInView } from "@/hooks/useInView";

export interface RevealProps {
  as?: "div" | "span" | "figure" | "section";
  className?: string;
  children: ReactNode;
  role?: string;
  "aria-label"?: string;
  style?: React.CSSProperties;
}

/**
 * Client island that lets server components replay their CSS entrance animation when scrolled
 * into view. Sets `data-reveal="pending"` while armed; see useArmedUntilInView.
 */
export function Reveal({ as: Tag = "div", className, children, ...aria }: RevealProps) {
  const [ref, armed] = useArmedUntilInView<HTMLElement>();
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={className}
      data-reveal={armed ? "pending" : undefined}
      {...aria}
    >
      {children}
    </Tag>
  );
}
