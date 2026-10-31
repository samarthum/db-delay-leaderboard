"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { fmtInt, fmtShare } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { clock } from "@/lib/routeSearch";
import { shortStation } from "@/lib/routeSlug";
import { makeT } from "@/lib/t";
import styles from "./ConnectionTool.module.css";

/** Trains offered as examples under the box; each must have a list in the data (checked when the data is loaded). */
const EXAMPLES = ["ICE 1541", "ICE 545", "ICE 695"];
/** The destination filter only earns its place on a long list (the median list has 3 rows). */
const DEST_FILTER_ROWS = 8;
/** Fewer days than this and a figure is shown as rough. */
const ROUGH_DAYS = 60;

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

/** Made it / missed it / next train cancelled for one pair, as widths that add up to the whole. */
function Tri({ ok, late, canc, n, className }: { ok: number; late: number; canc: number; n: number; className?: string }) {
  const w = (x: number) => `${(100 * x) / n}%`;
  return (
    <span className={`tri${className ? ` ${className}` : ""}`} aria-hidden="true">
      <i className="m" style={{ width: w(ok) }} />
      <i className="l" style={{ width: w(late) }} />
      <i className="c" style={{ width: w(canc) }} />
    </span>
  );
}

/**
 * "Will my connection work?", asked the way the trip is: the train you arrive on, the station, the train you take next.
 * The answer is what really happened between those two trains on the days the arriving train ran (their real arrival and
 * departure times), not an average over the station. It opens directly under the row you tapped. The address keeps the
 * choices, so a link opens on the answer.
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
  const answerRef = useRef<HTMLTableRowElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const otherWalk = slow ? WALK_FAST : WALK_SLOW;
  const matches = useMemo(() => (file && text.trim() && text.trim() !== train ? matchTrains(file, text) : []), [file, text, train]);
  const tr = file && train ? file[train] : null;
  const stations = useMemo(() => (tr ? stationsOf(tr) : []), [tr]);
  const st = tr && station ? tr.s[station] : null;
  const rows = useMemo(() => (st ? rowsFor(st, walk) : []), [st, walk]);
  const dests = useMemo(() => (rows.length > DEST_FILTER_ROWS ? destinationsOf(rows).slice(0, 5) : []), [rows]);
  const shown = dest ? rows.filter((r) => r.to === dest) : rows;
  const sel = rows.find((r) => r.train === next) ?? null;
  const other = useMemo(() => (sel ? rowsFor(st as NonNullable<typeof st>, otherWalk).find((r) => r.train === sel.train) ?? null : null), [sel, st, otherWalk]);
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
    setNext(r.train === next ? null : r.train);
    window.setTimeout(() => answerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  }
  function pickPace(v: boolean) {
    setSlow(v);
    writeSlow(v);
  }
  function editTrain() {
    setTrain(null);
    setStation(null);
    setNext(null);
    setDest(null);
    warm();
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }
  function editStation() {
    setStation(null);
    setNext(null);
    setDest(null);
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
  const sChosen = Boolean(st && station);

  return (
    <section className="sec" aria-labelledby="ct-q1" style={{ marginTop: 18 }}>
      {!train ? (
        <p className="sec-sub" style={{ marginTop: 0 }}>
          {t("cx.sub")}
        </p>
      ) : null}

      {train && tr ? (
        <div className="sum" id="ct-q1">
          <span className="tx">
            <b>{train}</b> {`${shortStation(tr.o)} → ${shortStation(tr.d)}`}
          </span>
          <button type="button" onClick={editTrain}>
            {t("cx.edit")}
          </button>
        </div>
      ) : (
        <>
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
              ref={inputRef}
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
        </>
      )}
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

      {tr && stations.length > 0 && !sChosen ? (
        <>
          <p className="seglabel" id="ct-q2">
            2. {t("cx.q2")}
          </p>
          <div className="seg wrap" role="group" aria-labelledby="ct-q2">
            {stations.map((s) => (
              <button key={s} type="button" aria-pressed={station === s} onClick={() => pickStation(s)}>
                {stationLabel(s)}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {st && station && train ? (
        <>
          <div className="sum" id="ct-q2">
            <span className="tx">{t("cx.at", { station: stationLabel(station) })}</span>
            {stations.length > 1 ? (
              <button type="button" onClick={editStation}>
                {t("cx.edit")}
              </button>
            ) : null}
          </div>

          <p className="seglabel" id="ct-q3">
            {t("cx.q3")}
          </p>
          <p className="basis" style={{ marginTop: 2 }}>
            {t("cx.due", { a: train, time: clock(st.t) })}
          </p>

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

          {dests.length >= 3 ? (
            <>
              <p className="seglabel" id="ct-to">
                {t("cx.to")}
              </p>
              <div className="seg wrap" role="group" aria-labelledby="ct-to">
                <button type="button" aria-pressed={dest === null} onClick={() => setDest(null)}>
                  {t("cx.toAll")}
                </button>
                {dests.map((d) => (
                  <button key={d} type="button" aria-pressed={dest === d} onClick={() => setDest(dest === d ? null : d)}>
                    {shortStation(d)}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {range && dest ? (
            <p className={styles.sentence} style={{ marginTop: 14 }}>
              {t("cx.range", { dest: shortStation(dest), lo: fmtShare(range.lo, lang), hi: fmtShare(range.hi, lang) })}
            </p>
          ) : null}

          <table className="bt ct">
            <colgroup>
              <col style={{ width: 60 }} />
              <col />
              <col style={{ width: 64 }} />
              <col style={{ width: 56 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{t("cx.th.time")}</th>
                <th>{t("cx.th.next")}</th>
                <th />
                <th className="r">{t("cx.th.made")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const open = r.train === next;
                return (
                  <Fragment key={r.train}>
                    <tr className={`tap${open ? " sel" : ""}${r.n < 40 ? " few" : ""}`}>
                      <td className="tm">{clock(r.dep)}</td>
                      <td className="two">
                        <button type="button" className="rowbtn" aria-pressed={open} onClick={() => pickNext(r)}>
                          <b>{t("cx.row", { train: r.train, dest: shortStation(r.to || "—") })}</b>
                          <span>{t("cx.row.sub", { gap: r.gap, n: fmtInt(r.n, lang) })}</span>
                        </button>
                      </td>
                      <td className="tb">
                        <Tri ok={r.ok} late={r.late} canc={r.cancelled} n={r.n} />
                      </td>
                      <td className="v">{fmtShare(r.pct, lang)}</td>
                    </tr>
                    {open && arrives ? (
                      <tr className="det" ref={answerRef}>
                        <td colSpan={4}>
                          <div className="res">
                            <p className="lead">
                              <span className="big">{fmtShare(r.pct, lang)}</span>
                              <span className="lt">{t("cx.res.lead", { ok: fmtInt(r.ok, lang), n: fmtInt(r.n, lang) })}</span>
                            </p>
                            <Tri ok={r.ok} late={r.late} canc={r.cancelled} n={r.n} className="full" />
                            <ul className="parts">
                              <li>
                                <i className="m" />
                                {t("cx.leg.made")} <b>{fmtInt(r.ok, lang)}</b>
                              </li>
                              <li>
                                <i className="l" />
                                {t("cx.leg.late")} <b>{fmtInt(r.late, lang)}</b>
                              </li>
                              <li>
                                <i className="c" />
                                {t("cx.res.canc", { b: r.train })} <b>{fmtInt(r.cancelled, lang)}</b>
                              </li>
                            </ul>
                            {r.cancelled > r.late && r.cancelled > 0 ? <p className="why">{t("cx.res.why", { b: r.train })}</p> : null}
                            <p className="fine">
                              {t("cx.res.where", { a: train, b: r.train, station: stationLabel(station), gap: r.gap })}{" "}
                              {t("cx.res.assume", {
                                walk,
                                other: otherWalk,
                                ok2: fmtInt(other ? other.ok : r.ok, lang),
                                n: fmtInt(r.n, lang),
                                pct2: fmtShare(other ? other.pct : r.pct, lang),
                              })}
                            </p>
                            <p className="fine">
                              {arrives[1] > 0
                                ? t("cx.a.late", { a: train, station: stationLabel(station), x: arrives[1], pct: arrives[4] })
                                : t("cx.a.ontime", { a: train, station: stationLabel(station), pct: arrives[4] })}{" "}
                              {r.leftMed > 0 ? t("cx.b.late", { b: r.train, x: r.leftMed }) : t("cx.b.ontime", { b: r.train })}
                            </p>
                            {r.n < ROUGH_DAYS ? <p className="fine">{t("cx.res.rough", { n: fmtInt(r.n, lang) })}</p> : null}
                            <p className="fine">{t("cx.res.hist", { span })}</p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 ? <p className="note">{t("cx.noRows", { station: stationLabel(station) })}</p> : null}

          <ul className="parts key" aria-hidden="true">
            <li>
              <i className="m" />
              {t("cx.leg.made")}
            </li>
            <li>
              <i className="l" />
              {t("cx.leg.late")}
            </li>
            <li>
              <i className="c" />
              {t("cx.leg.canc")}
            </li>
          </ul>

          <div className="visually-hidden" role="status" aria-live="polite">
            {sel ? t("cx.answer", { a: train, b: sel.train, station: stationLabel(station), gap: sel.gap, pct: fmtShare(sel.pct, lang), ok: fmtInt(sel.ok, lang), n: fmtInt(sel.n, lang) }) : ""}
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            {t("cx.note", { span })}
          </p>
        </>
      ) : null}
    </section>
  );
}
