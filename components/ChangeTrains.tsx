"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { successColor } from "@/lib/colors";
import { WALK_FAST, WALK_SLOW, readSlow, writeSlow } from "@/lib/connections";
import {
  destinationsOf,
  exactTrain,
  loadPairs,
  matchTrains,
  rowsFor,
  stationKey,
  stationsOf,
  type PairFile,
  type PairRow,
} from "@/lib/changeTrains";
import { fmtInt, fmtShare, spanLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { clock } from "@/lib/routeSearch";
import { shortStation } from "@/lib/routeSlug";
import { makeT } from "@/lib/t";
import styles from "./ConnectionTool.module.css";

/** Trains offered as examples under the box; each must have a list in the data (checked when the data is loaded). */
const EXAMPLES = ["ICE 1541", "ICE 545", "ICE 695"];

/** The choices go into the address (t = arriving train, at = station, n = next train); other parameters and the #hash stay. */
function writeUrl(train: string | null, station: string | null, next: string | null) {
  const p = new URLSearchParams(window.location.search);
  const before = p.toString();
  for (const [k, v] of [["t", train], ["at", station], ["n", next]] as const) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const q = p.toString();
  if (q === before) return;
  window.history.replaceState(window.history.state, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
}

/**
 * "Will my connection work?", asked the way the trip is: the train you arrive on, the station, the train you take next.
 * The answer is what really happened between those two trains on the days both ran (their real arrival and departure
 * times), not an average over the station. The address keeps the choices, so a link opens on the answer.
 */
export function ChangeTrains({ lang, span }: { lang: Lang; span: string }) {
  const t = makeT(lang);
  const [file, setFile] = useState<PairFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [train, setTrain] = useState<string | null>(null);
  const [station, setStation] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [ready, setReady] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  function warm() {
    if (!file) loadPairs().then(setFile, () => setFailed(true));
  }

  useEffect(() => {
    setSlow(readSlow());
    const q = new URLSearchParams(window.location.search);
    const want = { t: q.get("t"), s: q.get("at"), n: q.get("n") };
    if (!want.t) {
      setReady(true);
      return;
    }
    loadPairs().then(
      (f) => {
        setFile(f);
        const key = exactTrain(f, want.t as string);
        if (key) {
          setTrain(key);
          setText(key);
          const st = want.s ? stationKey(f[key], want.s) : null;
          const only = stationsOf(f[key]);
          const chosen = st ?? (only.length === 1 ? only[0] : null);
          setStation(chosen);
          if (chosen && want.n && f[key].s[chosen].b.some((b) => b[0] === want.n)) setNext(want.n);
        } else {
          setText(want.t as string);
        }
        setReady(true);
      },
      () => {
        setFailed(true);
        setReady(true);
      },
    );
  }, []);

  useEffect(() => {
    if (ready) writeUrl(train, station, next);
  }, [ready, train, station, next]);

  const walk = slow ? WALK_SLOW : WALK_FAST;
  const matches = useMemo(() => (file && text.trim() && text.trim() !== train ? matchTrains(file, text) : []), [file, text, train]);
  const tr = file && train ? file[train] : null;
  const stations = useMemo(() => (tr ? stationsOf(tr) : []), [tr]);
  const st = tr && station ? tr.s[station] : null;
  const rows = useMemo(() => (st ? rowsFor(st, walk) : []), [st, walk]);
  const dests = useMemo(() => destinationsOf(rows).slice(0, 5), [rows]);
  const shown = dest ? rows.filter((r) => r.to === dest) : rows;
  const sel = rows.find((r) => r.train === next) ?? null;
  const range = useMemo(() => {
    if (!dest || sel || shown.length < 2) return null;
    const v = shown.map((r) => r.pct);
    return { lo: Math.min(...v), hi: Math.max(...v) };
  }, [dest, sel, shown]);

  function pickTrain(key: string) {
    if (!file) return;
    const only = stationsOf(file[key]);
    setTrain(key);
    setText(key);
    setStation(only.length === 1 ? only[0] : null);
    setNext(null);
    setDest(null);
  }
  function pickStation(s: string) {
    setStation(s);
    setNext(null);
    setDest(null);
  }
  function pickNext(r: PairRow) {
    setNext(r.train);
    window.setTimeout(() => answerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 30);
  }
  function pickPace(v: boolean) {
    setSlow(v);
    writeSlow(v);
  }
  function onType(v: string) {
    setText(v);
    if (train && v.trim() !== train) {
      setTrain(null);
      setStation(null);
      setNext(null);
      setDest(null);
    }
    warm();
  }
  function onExample(key: string) {
    loadPairs().then(
      (f) => {
        setFile(f);
        const only = stationsOf(f[key]);
        setTrain(key);
        setText(key);
        setStation(only.length === 1 ? only[0] : null);
        setNext(null);
        setDest(null);
      },
      () => setFailed(true),
    );
  }

  const stationLabel = (n: string) => shortStation(n);
  const arrives = st && train ? st.a : null;

  return (
    <section className="sec" aria-labelledby="ct-q1" style={{ marginTop: 18 }}>
      <p className="sec-sub" style={{ marginTop: 0 }}>
        {t("cx.sub")}
      </p>

      <p className="seglabel" id="ct-q1">
        1. {t("cx.q1")}
      </p>
      <form
        className={styles.find}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const hit = file ? (exactTrain(file, text) ?? matchTrains(file, text, 1)[0]) : null;
          if (hit) pickTrain(hit);
        }}
      >
        <label htmlFor="ct-train" className="visually-hidden">
          {t("cx.q1")}
        </label>
        <input
          id="ct-train"
          className={styles.input}
          type="search"
          value={text}
          onChange={(e) => onType(e.target.value)}
          onFocus={warm}
          placeholder={t("cx.ph")}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
        />
        {matches.length > 0 && file ? (
          <ul className={styles.found}>
            {matches.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => pickTrain(k)}>
                  <b>{k}</b> <span style={{ fontWeight: 400, color: "var(--ink-2)" }}>{`${shortStation(file[k].o)} → ${shortStation(file[k].d)}`}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {text.trim() && !train && file && matches.length === 0 ? <p className="note">{t("cx.none", { q: text.trim() })}</p> : null}
        {text.trim() && !train && !file && !failed ? <p className="note">{t("conn.loading")}</p> : null}
      </form>
      {failed ? <p className="note">{t("conn.failed")}</p> : null}

      {!train ? (
        <p className="eg-line" style={{ marginTop: 6, fontSize: 15, color: "var(--ink-2)" }}>
          {t("home.egLabel")}:{" "}
          {EXAMPLES.map((k) => (
            <button key={k} type="button" className="tl" style={{ marginRight: 14, minHeight: 44, background: "none", border: 0, padding: 0, font: "inherit", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 4, cursor: "pointer" }} onClick={() => onExample(k)}>
              {k}
            </button>
          ))}
        </p>
      ) : null}

      {tr ? (
        <p className="basis" style={{ marginTop: 8 }}>
          <b style={{ color: "var(--ink)" }}>{train}</b> {`${shortStation(tr.o)} → ${shortStation(tr.d)}`}
        </p>
      ) : null}

      {tr && stations.length > 0 ? (
        <>
          <p className="seglabel" id="ct-q2">
            2. {t("cx.q2")}
          </p>
          <div className="seg c2" role="group" aria-labelledby="ct-q2">
            {stations.map((s) => (
              <button key={s} type="button" aria-pressed={station === s} onClick={() => pickStation(s)}>
                {stationLabel(s)}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {st && station ? (
        <>
          <p className="seglabel" id="ct-q3">
            3. {t("cx.q3")}
          </p>
          {dests.length >= 3 ? (
            <div className="seg c3" role="group" aria-label={t("cx.to")} style={{ marginBottom: 8 }}>
              <button type="button" aria-pressed={dest === null} onClick={() => setDest(null)}>
                {t("cx.toAll")}
              </button>
              {dests.slice(0, 5).map((d) => (
                <button key={d} type="button" aria-pressed={dest === d} onClick={() => setDest(dest === d ? null : d)}>
                  {shortStation(d)}
                </button>
              ))}
            </div>
          ) : null}
          <table className="bt">
            <colgroup>
              <col />
              <col style={{ width: 56 }} />
              <col style={{ width: 52 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{t("cx.th.train", { station: stationLabel(station) })}</th>
                <th />
                <th className="r">{t("conn.worked")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.train} className={`tap${r.train === next ? " sel" : ""}`}>
                  <td className="two">
                    <button type="button" className="rowbtn" aria-pressed={r.train === next} onClick={() => pickNext(r)}>
                      <b>{t("conn.train.row", { time: clock(r.dep), train: r.train, dest: shortStation(r.to || "—") })}</b>
                      <span>{t("cx.planned", { gap: r.gap })}</span>
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
          {shown.length === 0 ? <p className="note">{t("cx.noRows", { station: stationLabel(station) })}</p> : null}

          <p className="seglabel" id="ct-pace">
            {t("conn.q3")}
          </p>
          <div className="seg c2" role="group" aria-labelledby="ct-pace">
            <button type="button" aria-pressed={!slow} onClick={() => pickPace(false)}>
              {t("conn.p2")}
            </button>
            <button type="button" aria-pressed={slow} onClick={() => pickPace(true)}>
              {t("conn.p6")}
            </button>
          </div>

          <div className={styles.answer} ref={answerRef} aria-live="polite">
            {sel && arrives ? (
              <>
                <p className={styles.sentence}>
                  {t("cx.answer", { a: train as string, b: sel.train, station: stationLabel(station), gap: sel.gap, pct: fmtShare(sel.pct, lang), n: fmtInt(sel.n, lang) })}
                </p>
                <p className="basis">
                  {arrives[1] > 0
                    ? t("cx.a.late", { a: train as string, station: stationLabel(station), x: arrives[1], pct: arrives[4] })
                    : t("cx.a.ontime", { a: train as string, station: stationLabel(station), pct: arrives[4] })}{" "}
                  {sel.leftMed > 0 ? t("cx.b.late", { b: sel.train, x: sel.leftMed }) : t("cx.b.ontime", { b: sel.train })}
                </p>
                <p className="basis">{t("cx.counts", { ok: fmtInt(sel.ok, lang), n: fmtInt(sel.n, lang), walk, canc: fmtInt(sel.cancelled, lang) })}</p>
              </>
            ) : range && dest ? (
              <>
                <p className={styles.sentence}>{t("cx.range", { dest: shortStation(dest), lo: fmtShare(range.lo, lang), hi: fmtShare(range.hi, lang) })}</p>
                <p className="basis">{t("cx.range.sub")}</p>
              </>
            ) : (
              <p className={styles.sentence}>{t("cx.pick")}</p>
            )}
          </div>

          <div className="legend">
            {([["conn.leg1", 90], ["conn.leg2", 70], ["conn.leg3", 55], ["conn.leg4", 20]] as const).map(([k, v]) => (
              <span key={k}>
                <i style={{ background: successColor(v) }} />
                {t(k)}
              </span>
            ))}
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            {t("cx.note", { span })}
          </p>
        </>
      ) : null}
    </section>
  );
}
