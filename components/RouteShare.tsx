"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { ShareButton } from "./ShareButton";
import styles from "./pages/RoutePage.module.css";

/**
 * Share a route: the link and text through the phone's share sheet, plus a button that shares the picture itself
 * (the portrait card), falling back to a download where files cannot be shared.
 */
export function RouteShare({
  lang,
  title,
  text,
  url,
  image,
  filename,
}: {
  lang: Lang;
  title: string;
  text: string;
  url: string;
  /** Path of the portrait card, e.g. /og/routes/2026-09/koeln-hbf-berlin-hbf-portrait.png */
  image: string;
  filename: string;
}) {
  const t = makeT(lang);
  const [status, setStatus] = useState("");

  async function sharePicture() {
    setStatus(t("route.saving"));
    try {
      const res = await fetch(image);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${filename}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text, url });
          setStatus("");
          return;
        } catch (err) {
          if ((err as DOMException).name === "AbortError") {
            setStatus("");
            return;
          }
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setStatus(t("route.saved"));
    } catch {
      setStatus(t("route.saveFail"));
    }
  }

  return (
    <div>
      <ShareButton lang={lang} title={title} text={text} url={url} label={t("route.share")}>
        <button type="button" className={styles.pictureButton} onClick={sharePicture}>
          {t("route.save")}
        </button>
      </ShareButton>
      {status ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
