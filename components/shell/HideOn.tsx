"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Renders its children everywhere except on the listed paths (e.g. no footer link row on Change trains). */
export function HideOn({ paths, children }: { paths: string[]; children: ReactNode }) {
  const p = usePathname() ?? "/";
  const path = p.endsWith("/") ? p : `${p}/`;
  return paths.includes(path) ? null : <>{children}</>;
}
