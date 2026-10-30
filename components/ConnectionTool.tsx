"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { successColor } from "@/lib/colors";
import {
  BUSY,
  LADDER,
  WALK_FAST,
  WALK_SLOW,
  ladder,
  loadConnections,
  matchStations,
  readGap,
  readSlow,
  readStation,
  stationFor,
  writeGap,
  writeSlow,
  writeStation,
  type ConnFile,
} from "@/lib/connections";
import { fmtInt, fmtShare, spanLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { shortStation } from "@/lib/routeSlug";
import { makeT } from "@/lib/t";
import styles from "./ConnectionTool.module.css";

/**
 * "Will my connection work?": three questions the visitor can answer (where, how many minutes the app shows, how long
 * they need to walk), one sentence back, and the whole ladder underneath for the other change times.
 * Everything is remembered on the phone, so the second visit opens on the answer.
 */
export function ConnectionTool({ lang, station: preset, heading = "h2", title, sub, steps = true, hideTitle = false }: { lang: Lang; station?: string; heading?: "h1" | "h2"; title?: string; sub?: string; steps?: boolean; hideTitle?: boolean }) {
  const t = makeT(lang);
  const uid = useRef(`conn-${Math.random().toString(36).slice(2, 7)}`).current;
  const [file, setFile] = useState<ConnFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [gap, setGap] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [typing, setTyping] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSlow(readSlow());
    setGap(readGap());
    // A link can name the station ("?s=Berlin+Hbf", from a route page); otherwise the one remembered on this phone.
    const fromUrl = new URLSearchParams(window.location.search).get("s");
    setName(preset ?? fromUrl ?? readStation());
    loadConnections().then(setFile, () => setFailed(true));
  }, [preset]);

  const walk = slow ? WALK_SLOW : WALK_FAST;
  const st = useMemo(() => (file && name ? stationFor(file, name) : null), [file, name]);
  const rows = useMemo(() => (file && st ? ladder(st, walk, file.params.walk) : []), [file, st, walk]);
  const found = useMemo(() => (file && query.trim() ? matchStations(file, query) : []), [file, query]);
  const row = rows.find((r) => r.gap === gap) ?? null;
  const span = file ? spanLabel(file.window.firstMonth, file.window.lastMonth, lang) : "";

  const chips = useMemo(() => {
    const base = file ? BUSY.filter((n) => stationFor(file, n)) : BUSY;
    return st && !base.includes(st.name) ? [st.name, ...base] : base;
  }, [file, st]);

  function pickStation(n: string) {
    setName(n);
    writeStation(n);
    setTyping(false);
    setQuery("");
  }
  function pickGap(g: number) {
    setGap(g);
    writeGap(g);
  }
  function pickPace(v: boolean) {
    setSlow(v);
    writeSlow(v);
  }

  const Head = heading;
  const label = st ? shortStation(st.name) : name ? shortStation(name) : "";

  return (
    <section className={styles.tool} aria-labelledby={`${uid}-h`}>
      <Head id={`${uid}-h`} className={hideTitle ? "visually-hidden" : heading === "h1" ? "h1" : styles.title}>
        {title ?? t("conn.title")}
      </Head>
      <p className="sec-sub">{sub ?? t("conn.sub")}</p>

      <p className="seglabel" id={`${uid}-q1`}>
        {steps ? "1. " : ""}{t("conn.q1")}
      </p>
      <div className="seg c2" role="group" aria-labelledby={`${uid}-q1`}>
        {chips.map((n) => (
          <button key={n} type="button" aria-pressed={st?.name === n || (!st && name === n)} onClick={() => pickStation(n)}>
            {shortStation(n)}
          </button>
        ))}
        <button type="button" aria-expanded={typing} onClick={() => setTyping((v) => !v)}>
          {t("conn.other")}
        </button>
      </div>

      {typing ? (
        <div className={styles.find}>
          <label htmlFor={`${uid}-s`} className="visually-hidden">
            {t("conn.station")}
          </label>
          <input
            id={`${uid}-s`}
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
                    <button type="button" onClick={() => pickStation(s.name)}>
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">{t("conn.none", { q: query.trim() })}</p>
            )
          ) : null}
        </div>
      ) : null}

      {failed ? <p className="note">{t("conn.failed")}</p> : null}
      {!file && !failed && name ? <p className="note">{t("conn.loading")}</p> : null}
      {file && name && !st ? <p className="note">{t("conn.none", { q: shortStation(name) })}</p> : null}

      {file && st ? (
        <>
          <p className="seglabel" id={`${uid}-q2`}>
            {steps ? "2. " : ""}{t("conn.q2")}
          </p>
          <div className="seg c5" role="group" aria-labelledby={`${uid}-q2`}>
            {LADDER.map((g) => (
              <button key={g} type="button" aria-pressed={gap === g} onClick={() => pickGap(g)}>
                {t("conn.min", { n: g })}
              </button>
            ))}
          </div>

          <p className="seglabel" id={`${uid}-q3`}>
            {steps ? "3. " : ""}{t("conn.q3")}
          </p>
          <div className="seg c2" role="group" aria-labelledby={`${uid}-q3`}>
            <button type="button" aria-pressed={!slow} onClick={() => pickPace(false)}>
              {t("conn.p2")}
            </button>
            <button type="button" aria-pressed={slow} onClick={() => pickPace(true)}>
              {t("conn.p6")}
            </button>
          </div>

          <div className={styles.answer} aria-live="polite">
            {row ? (
              <>
                <p className={styles.sentence}>{t("conn.answer", { station: label, gap: row.gap, pct: fmtShare(row.pct, lang) })}</p>
                <p className="basis">{t("conn.answerSub", { ok: fmtInt(row.ok, lang), n: fmtInt(row.n, lang), walk, canc: fmtInt(row.cancelled, lang) })}</p>
              </>
            ) : (
              <p className={styles.sentence}>{t("conn.pick")}</p>
            )}
          </div>

          <h3 className={styles.others}>{t("conn.others", { station: label })}</h3>
          <table className="bt">
            <colgroup>
              <col style={{ width: 84 }} />
              <col />
              <col style={{ width: 56 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{t("conn.rows")}</th>
                <th />
                <th className="r">{t("conn.worked")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.gap} className={`tap${r.gap === gap ? " sel" : ""}`}>
                  <td className="k">
                    <button type="button" className="rowbtn" aria-pressed={r.gap === gap} onClick={() => pickGap(r.gap)}>
                      {t("conn.min", { n: r.gap })}
                    </button>
                  </td>
                  <td className="bar">
                    <span>
                      <i style={{ width: `${Math.max(0.8, r.pct)}%`, background: successColor(r.pct) }} />
                    </span>
                  </td>
                  <td className="v">{fmtShare(r.pct, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="legend">
            {([["conn.leg1", 90], ["conn.leg2", 70], ["conn.leg3", 55], ["conn.leg4", 20]] as const).map(([k, v]) => (
              <span key={k}>
                <i style={{ background: successColor(v) }} />
                {t(k)}
              </span>
            ))}
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            {t("conn.dips")} {t("conn.caveat", { span })}
          </p>
        </>
      ) : null}
    </section>
  );
}
