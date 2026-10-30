"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { lateShareColor } from "@/lib/colors";
import {
  BUSY,
  WALK_FAST,
  WALK_SLOW,
  findStation,
  ladder,
  loadConnections,
  matchStations,
  readSlow,
  readStation,
  writeSlow,
  writeStation,
  type ConnFile,
} from "@/lib/connections";
import { fmtInt, fmtShare, spanLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { shortStation } from "@/lib/routeSlug";
import { makeT } from "@/lib/t";
import styles from "./ConnectionCard.module.css";

/**
 * "Will my connection work?" on the home page: pick the station, see the whole ladder of change times at once. The
 * station is remembered on the phone, so the second visit is open and answered without a tap.
 */
export function ConnectionCard({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const uid = useRef(`conn-${Math.random().toString(36).slice(2, 7)}`).current;
  const [file, setFile] = useState<ConnFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [station, setStation] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [typing, setTyping] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    setSlow(readSlow());
    setStation(readStation());
    loadConnections().then(setFile, () => setFailed(true));
  }, []);

  const walk = slow ? WALK_SLOW : WALK_FAST;
  const st = useMemo(() => (file && station ? findStation(file, station) : null), [file, station]);
  const rows = useMemo(() => (file && st ? ladder(st, walk, file.params.walk) : []), [file, st, walk]);
  const found = useMemo(() => (file && query.trim() ? matchStations(file, query) : []), [file, query]);
  const busy = useMemo(() => (file ? BUSY.filter((n) => findStation(file, n)) : BUSY), [file]);

  function pick(name: string) {
    setStation(name);
    writeStation(name);
    setTyping(false);
    setQuery("");
    setOpen(null);
  }
  function toggleSlow(v: boolean) {
    setSlow(v);
    writeSlow(v);
  }

  const span = file ? spanLabel(file.window.firstMonth, file.window.lastMonth, lang) : "";
  const names = station && !busy.includes(station) ? [station, ...busy] : busy;

  return (
    <section className={styles.card} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className={styles.title}>
        {t("conn.title")}
      </h2>
      <p className={styles.sub}>{t("conn.sub")}</p>

      <div className={styles.stations} role="group" aria-label={t("conn.busy")}>
        {names.map((n) => (
          <button key={n} type="button" className={styles.chip} aria-pressed={station === n} onClick={() => pick(n)}>
            {shortStation(n)}
          </button>
        ))}
        <button type="button" className={styles.chip} aria-expanded={typing} onClick={() => setTyping((v) => !v)}>
          {t("conn.other")}
        </button>
      </div>

      {typing ? (
        <div className={styles.find}>
          <label htmlFor={`${uid}-q`} className={styles.srOnly}>
            {t("conn.station")}
          </label>
          <input
            id={`${uid}-q`}
            className={styles.input}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("conn.placeholder")}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
          {query.trim() ? (
            found.length > 0 ? (
              <ul className={styles.found}>
                {found.map((s) => (
                  <li key={s.name}>
                    <button type="button" className={styles.foundItem} onClick={() => pick(s.name)}>
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.note}>{t("conn.none", { q: query.trim() })}</p>
            )
          ) : null}
        </div>
      ) : null}

      {failed ? <p className={styles.note}>{t("conn.failed")}</p> : null}
      {!file && !failed ? <p className={styles.note}>{t("conn.loading")}</p> : null}

      {file && station && !st ? <p className={styles.note}>{t("conn.none", { q: shortStation(station) })}</p> : null}

      {file && st && rows.length > 0 ? (
        <div className={styles.result}>
          <p className={styles.rowsHead}>
            <span>{t("conn.rows")}</span>
            <span aria-hidden="true">{shortStation(st.name)}</span>
          </p>
          <ul className={styles.ladder}>
            {rows.map((r) => {
              const pct = Math.round(r.pct);
              const isOpen = open === r.gap;
              return (
                <li key={r.gap}>
                  <button type="button" className={styles.row} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.gap)}>
                    <span className={styles.gap}>{t("conn.min", { n: r.gap })}</span>
                    <span className={styles.bar} aria-hidden="true">
                      <span className={styles.fill} style={{ width: `${pct}%`, background: lateShareColor(100 - r.pct) }} />
                    </span>
                    <span className={styles.pct} style={{ color: lateShareColor(100 - r.pct) }}>
                      {t("conn.pct", { pct: fmtShare(r.pct, lang) })}
                    </span>
                  </button>
                  {isOpen ? (
                    <p className={styles.detail}>
                      {t("conn.detail", {
                        n: fmtInt(r.n, lang),
                        gap: r.gap,
                        station: shortStation(st.name),
                        ok: fmtInt(r.ok, lang),
                        pct: fmtShare(r.pct, lang),
                        walk,
                        canc: fmtInt(r.cancelled, lang),
                      })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <label className={styles.toggle}>
            <input type="checkbox" checked={slow} onChange={(e) => toggleSlow(e.target.checked)} />
            <span>{t("conn.walk")}</span>
          </label>
          <p className={styles.note}>{t("conn.walkHint", { fast: WALK_FAST, slow: WALK_SLOW })}</p>
          <p className={styles.note}>{t("conn.caveat", { span })}</p>
        </div>
      ) : null}
    </section>
  );
}
