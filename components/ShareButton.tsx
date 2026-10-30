"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import styles from "./ShareButton.module.css";

interface ShareButtonProps {
  title: string;
  /** Prefilled share text. */
  text: string;
  /** Absolute page URL. */
  url: string;
  /** Button text, e.g. "Share this route". */
  label: string;
  lang?: Lang;
  /** Path of the share picture. When the phone can share files it goes along; otherwise the link is shared. */
  image?: string;
  filename?: string;
}

/**
 * One Share button. On a phone it opens the share sheet with the picture attached; elsewhere it shares the link, or
 * copies it and says so ("Link copied."), or shows the link to copy by hand.
 */
export function ShareButton({ title, text, url, label, lang = "en", image, filename = "german-punctuality" }: ShareButtonProps) {
  const [status, setStatus] = useState("");
  const t = makeT(lang);

  async function share() {
    let files: File[] | undefined;
    if (image) {
      try {
        const res = await fetch(image);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], `${filename}.png`, { type: "image/png" });
          if (navigator.canShare?.({ files: [file] })) files = [file];
        }
      } catch {
        // no picture: share the link
      }
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(files ? { title, text, url, files } : { title, text, url });
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus(t("share.copied"));
    } catch {
      setStatus(t("share.copyThis", { url }));
    }
    window.setTimeout(() => setStatus(""), 6000);
  }

  return (
    <div className={styles.share}>
      <button type="button" className="btn" onClick={share}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
        {label}
      </button>
      <p className={styles.status} aria-live="polite" role="status">
        {status}
      </p>
    </div>
  );
}
