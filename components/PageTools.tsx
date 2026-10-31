"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { remember, type Recent } from "@/lib/recent";

/** Puts this page on the visitor's "Recent" list in the search sheet. Renders nothing. */
export function RememberPage({ lang, item }: { lang: Lang; item: Recent }) {
  useEffect(() => {
    remember(lang, item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, item.href]);
  return null;
}

/**
 * Phones: once the page's big figure has scrolled away, a slim bar keeps what this page is about and its number
 * ("Hamburg Hbf → Berlin Hbf · 41%") at the top. Hidden while the figure is on screen and on wide screens.
 */
export function StickyTitle({ title, value }: { title: string; value: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const fig = document.querySelector("main .fig");
    if (!fig || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(fig);
    return () => io.disconnect();
  }, []);
  return (
    <div className="sticky-title" data-show={show || undefined} aria-hidden="true">
      <div className="container">
        <span className="st-t">{title}</span>
        <span className="st-v">{value}</span>
      </div>
    </div>
  );
}
