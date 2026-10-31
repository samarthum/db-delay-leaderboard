"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { delayColor } from "@/lib/colors";
import { fmt1 } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { onSavedChange, readSaved, type Saved } from "@/lib/saved";
import { makeT } from "@/lib/t";
import { clockOf, statusOf, useLiveRun } from "./LiveNow";

const LIVE_ROWS = 4; // live lookups per visit: the API's call budget is shared by every visitor

function Row({ s, lang, live }: { s: Saved; lang: Lang; live: boolean }) {
  const t = makeT(lang);
  const a = useLiveRun(live && s.live ? s.live : null);
  const st = a ? statusOf(a.run, t) : null;
  return (
    <li>
      <Link href={s.href} prefetch={false}>
        <span className="yt-main">
          <b>{s.title}</b>
          <small>{a ? `${t("live.now.title")} ${clockOf(a.run.pd)} · ${s.sub}` : s.sub}</small>
        </span>
        {st ? (
          <span className="yt-live" style={{ ["--c" as string]: st.color }}>
            {st.text}
          </span>
        ) : (
          <span className="yt-avg" style={{ color: delayColor(s.avg) }}>
            <em>{t("list.avg", { x: fmt1(Math.max(0, s.avg), lang) })}</em>
            <small>{t("save.avg")}</small>
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * "Your trains" on the home page: what the visitor starred on train and route pages, newest first. A saved train that runs
 * in the next hours shows today's departure and the delay DB reports now; everything else shows its usual delay.
 * Renders nothing until something is saved.
 */
export function YourTrains({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const [items, setItems] = useState<Saved[]>([]);
  useEffect(() => {
    const read = () => setItems(readSaved(lang));
    read();
    return onSavedChange(read);
  }, [lang]);
  if (items.length === 0) return null;
  let liveLeft = LIVE_ROWS;
  return (
    <section className="yt" aria-labelledby="yt-h">
      <h2 id="yt-h">{t("save.title")}</h2>
      <ul>
        {items.map((s) => {
          const live = Boolean(s.live) && liveLeft-- > 0;
          return <Row key={s.href} s={s} lang={lang} live={live} />;
        })}
      </ul>
    </section>
  );
}
