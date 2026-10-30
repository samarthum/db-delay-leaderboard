"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Arrow } from "./Arrow";

/**
 * "Back", only when the visitor came from another page of this site. A visitor from a shared link or a search engine
 * did not come from the ranking, so a link that says so would be wrong; for them the tab bar is the way out.
 */
export function BackLink({ lang }: { lang: Lang }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      setShow(Boolean(ref && ref.origin === window.location.origin && ref.pathname !== window.location.pathname));
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  return (
    <button type="button" className="back" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => window.history.back()}>
      <Arrow back /> {makeT(lang)("back.generic")}
    </button>
  );
}
