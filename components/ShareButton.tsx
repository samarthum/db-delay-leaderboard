"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import styles from "./ShareButton.module.css";

interface ShareButtonProps {
  title: string;
  /** Prefilled share text (also used for the X intent). */
  text: string;
  /** Absolute page URL. */
  url: string;
  /** Button text, e.g. "Share this line". */
  label: string;
  lang?: Lang;
  /** Extra buttons that sit in the same row. */
  children?: React.ReactNode;
}

export function ShareButton({ title, text, url, label, lang = "en", children }: ShareButtonProps) {
  const [status, setStatus] = useState("");
  const t = makeT(lang);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
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
    window.setTimeout(() => setStatus(""), 4000);
  }

  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <div className={styles.share}>
      <div className={styles.buttons}>
        <button type="button" className={styles.primary} onClick={share}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path
              d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {label}
        </button>
        <a className={styles.secondary} href={xHref} target="_blank" rel="noopener noreferrer">
          {t("share.x")}
        </a>
        {children}
      </div>
      <p className={styles.status} aria-live="polite" role="status">
        {status}
      </p>
    </div>
  );
}
