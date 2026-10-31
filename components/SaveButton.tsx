"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { isSaved, onSavedChange, toggleSaved, type Saved } from "@/lib/saved";
import { makeT } from "@/lib/t";

/** A 44 px star on a train or route page's title row: keeps the page on "Your trains" on the home page (this device only). */
export function SaveButton({ lang, item }: { lang: Lang; item: Saved }) {
  const t = makeT(lang);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(isSaved(lang, item.href));
    read();
    return onSavedChange(read);
  }, [lang, item.href]);
  const label = on ? t("save.remove") : t(item.kind === "train" ? "save.addTrain" : "save.addRoute");
  return (
    <button type="button" className="iconlink savebtn" aria-pressed={on} aria-label={label} title={label} onClick={() => setOn(toggleSaved(lang, item))}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.6l2.5 5.4 5.9.6-4.4 4 1.3 5.8L12 16.4l-5.3 3 1.3-5.8-4.4-4 5.9-.6z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
