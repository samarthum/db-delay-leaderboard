"use client";

import { useEffect, useRef } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { ConnectionTool } from "./ConnectionTool";

/**
 * The station-level guide for a visitor who does not know the trains. Closed by default so the first screen is one
 * question; a link that names a station (a route page: "?s=Berlin Hbf#typical") opens it and scrolls to it.
 */
export function TypicalGuide({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).has("s") || window.location.hash === "#typical";
    if (wanted && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ block: "start" });
    }
  }, []);
  return (
    <details className="disc" id="typical" ref={ref} style={{ marginTop: 28 }}>
      <summary>{t("cx.typical.title")}</summary>
      <ConnectionTool lang={lang} sub={t("cx.typical.sub")} steps={false} hideTitle />
    </details>
  );
}
