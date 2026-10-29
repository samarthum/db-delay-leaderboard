"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { SEARCH_INDEX, loadStops, loadTypeahead, pickByKey, runSearch, type SearchOutcome } from "@/lib/searchClient";
import { clock, diagnoseRoute, findTrains, parseRoute, splitRoute, type RouteHit, type RouteQuery, type StopsIndex } from "@/lib/routeSearch";
import { unitName, type SearchUnit } from "@/lib/searchCore";
import { findStation, flatten, suggest, type Suggestion, type TaIndex, type TaStationEntry, type TaTrainEntry } from "@/lib/typeahead";
import { fmt1, fmtShare, fmtShare1, spanLabel } from "@/lib/format";
import { lateShareColor } from "@/lib/colors";
import { route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { SearchResult, kindLabel, routeText } from "./SearchResult";
import styles from "./Search.module.css";

const EXAMPLES = ["Köln to Berlin", "ICE 1541", "Köln Hbf"];
const EXAMPLES_DE = ["Köln nach Berlin", "ICE 1541", "Köln Hbf"];
const TYPING_DELAY_MS = 220;

interface Applied {
  q: string;
  u: string | null;
  /** Set when the visitor picked a station; the page shows its trains. */
  s: string | null;
  /** True when q is a route ("Köln to Berlin"): the page lists trains between the two places. */
  r: boolean;
}

/** A route suggestion in the dropdown. */
interface RouteItem {
  kind: "route";
  query: RouteQuery;
  count: number;
}
type Item = Suggestion | RouteItem;

function readUrl(): Applied {
  const p = new URLSearchParams(window.location.search);
  return { q: (p.get("q") ?? "").trim(), u: p.get("u"), s: p.get("s"), r: p.get("r") === "1" };
}

function urlFor(a: Applied): string {
  const p = new URLSearchParams();
  if (a.q) p.set("q", a.q);
  if (a.q && a.u) p.set("u", a.u);
  if (a.s) p.set("s", a.s);
  if (a.q && a.r) p.set("r", "1");
  const s = p.toString();
  return `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
}

/** The home page's search: a big box, live suggestions under it, and the answer below. */
export function Search({ lang, idle, title, sub }: { lang: Lang; idle?: React.ReactNode; title: string; sub: string }) {
  const t = makeT(lang);
  const uid = useId();
  const [text, setText] = useState("");
  const [applied, setApplied] = useState<Applied>({ q: "", u: null, s: null, r: false });
  const [answer, setAnswer] = useState<{ q: string; outcome: SearchOutcome } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ta, setTa] = useState<TaIndex | null>(null);
  const [stops, setStops] = useState<StopsIndex | null>(null);
  const [stopsFailed, setStopsFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<number | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  const commit = useCallback((next: Applied, mode: "push" | "replace") => {
    const href = urlFor(next);
    if (href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      if (mode === "push") window.history.pushState(null, "", href);
      else window.history.replaceState(null, "", href);
    }
    setApplied(next);
  }, []);

  // The page's own address is the state: read it on load and on back/forward.
  useEffect(() => {
    const sync = () => {
      const url = readUrl();
      setText(url.s ?? url.q);
      setApplied(url);
      setOpen(false);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // Fetch the typeahead index on first focus, or right away when the address names a query.
  const warm = useCallback(() => {
    loadTypeahead().then(setTa, () => undefined);
  }, []);
  const warmStops = useCallback(() => {
    loadStops().then(setStops, () => setStopsFailed(true));
  }, []);
  useEffect(() => {
    if (applied.q || applied.s) warm();
    if (applied.r) warmStops();
  }, [applied.q, applied.s, applied.r, warm, warmStops]);

  useEffect(() => {
    if (!applied.q || applied.s || applied.r) {
      setAnswer(null);
      setFailed(false);
      return;
    }
    let current = true;
    setFailed(false);
    runSearch(applied.q).then(
      (outcome) => current && setAnswer({ q: applied.q, outcome }),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [applied.q, applied.s, applied.r]);

  const suggestions = useMemo(() => (ta && text.trim() ? suggest(ta, text) : null), [ta, text]);
  const routeItem = useMemo<RouteItem | null>(() => {
    if (!stops || !text.trim()) return null;
    const query = parseRoute(stops, text);
    if (!query) return null;
    const hits = findTrains(stops, query);
    const rated = hits.filter((h) => h.late !== null).length;
    return { kind: "route", query, count: rated || hits.length };
  }, [stops, text]);
  const flat = useMemo<Item[]>(() => [...(routeItem ? [routeItem] : []), ...(suggestions ? flatten(suggestions) : [])], [routeItem, suggestions]);
  const showList = open && text.trim().length > 0 && applied.q !== text.trim();

  function onType(value: string) {
    setText(value);
    setOpen(true);
    setActive(-1);
    // Two words or a separator might be a route: fetch the per-stop data now so the suggestion can appear.
    if (/\s|→|->|\d:\d/.test(value.trim())) warmStops();
    window.clearTimeout(timer.current);
    // A train number resolves while typing; the dropdown is the way to pick anything else.
    timer.current = window.setTimeout(() => {
      if (/^\s*[a-zA-Z]{0,4}\s*\d+[a-zA-Z]?\s*$/.test(value) && /\d{3,}/.test(value)) commit({ q: value.trim(), u: null, s: null, r: false }, "replace");
    }, TYPING_DELAY_MS);
  }

  function pick(s: Item) {
    window.clearTimeout(timer.current);
    setOpen(false);
    input.current?.blur();
    if (s.kind === "route") {
      commit({ q: text.trim(), u: null, s: null, r: true }, "push");
    } else if (s.kind === "station") {
      setText(s.station.name);
      commit({ q: s.station.name, u: null, s: s.station.name, r: false }, "push");
    } else {
      const name = unitName(s.train);
      setText(name);
      commit({ q: name, u: s.train.kind === 0 ? null : s.train.key, s: null, r: false }, "push");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    window.clearTimeout(timer.current);
    const value = text.trim();
    if (!value) return;
    if (active >= 0 && flat[active]) return pick(flat[active]);
    setOpen(false);
    input.current?.blur();
    // A route wins over a lookalike: "Köln Berlin" is a trip, not a station.
    if (routeItem || (stops && splitRoute(value))) return commit({ q: value, u: null, s: null, r: true }, "push");
    // The per-stop data may still be loading, or the text may only look like a route: decide once it is here.
    if (!stops && /\s|→|->|\d:\d/.test(value)) {
      loadStops().then(
        (idx) => {
          setStops(idx);
          const query = parseRoute(idx, value);
          commit({ q: value, u: null, s: null, r: Boolean(query) || Boolean(splitRoute(value)) }, "push");
        },
        () => commit({ q: value, u: null, s: null, r: false }, "push"),
      );
      return;
    }
    const st = ta ? findStation(ta, value) : null;
    const numeric = /^[a-zA-Z]{0,4}\s*\d/.test(value);
    if (st && !numeric) {
      setText(st.name);
      commit({ q: st.name, u: null, s: st.name, r: false }, "push");
    } else {
      commit({ q: value, u: null, s: null, r: false }, "push");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && flat.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % flat.length);
    } else if (e.key === "ArrowUp" && flat.length > 0) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? flat.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  function ask(q: string, u: string | null = null, asRoute = false) {
    window.clearTimeout(timer.current);
    setText(q);
    setOpen(false);
    if (asRoute) return commit({ q, u: null, s: null, r: true }, "push");
    const st = ta ? findStation(ta, q) : null;
    if (st && !/\d/.test(q) && u === null) commit({ q: st.name, u: null, s: st.name, r: false }, "push");
    else commit({ q, u, s: null, r: false }, "push");
  }

  function clear() {
    window.clearTimeout(timer.current);
    setText("");
    setOpen(false);
    commit({ q: "", u: null, s: null, r: false }, "push");
    input.current?.focus();
  }

  const ready = answer !== null && answer.q === applied.q ? answer.outcome : null;
  const examples = lang === "de" ? EXAMPLES_DE : EXAMPLES;
  const stationEntry: TaStationEntry | null = ta && applied.s ? (ta.stations.find((s) => s.name === applied.s) ?? null) : null;
  const span = spanLabel(SEARCH_INDEX.window.firstMonth, SEARCH_INDEX.window.lastMonth, lang);
  const listId = `${uid}-list`;

  const hasQuery = Boolean(applied.q || applied.s);
  return (
    <div className={styles.root} data-active={hasQuery || undefined}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{title}</h1>
        {hasQuery ? null : <p className={styles.sub}>{sub}</p>}
      </div>
      <form className={styles.field} role="search" onSubmit={submit} autoComplete="off">
        <label htmlFor={`${uid}-q`} className={styles.label}>
          {t("home.label")}
        </label>
        <div className={styles.inputWrap}>
          <input
            ref={input}
            id={`${uid}-q`}
            className={styles.input}
            type="search"
            name="q"
            value={text}
            onChange={(e) => onType(e.target.value)}
            onFocus={() => {
              warm();
              setOpen(true);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 160)}
            onKeyDown={onKeyDown}
            placeholder={t("home.placeholder")}
            role="combobox"
            aria-expanded={showList && flat.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${uid}-o${active}` : undefined}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
          />
          {text ? (
            <button type="button" className={styles.clear} onClick={clear} aria-label={t("sug.clear")}>
              ×
            </button>
          ) : null}
          <button type="submit" className={styles.go}>
            {t("home.go")}
          </button>
        </div>

        {showList ? (
          <div id={listId} className={styles.list} role="listbox" aria-label={t("sug.list")}>
            {!ta && !routeItem ? null : flat.length === 0 ? (
              <p className={styles.hint}>{t("sug.empty", { q: text.trim() })}</p>
            ) : (
              <Groups suggestions={suggestions ?? { trains: [], lines: [], stations: [] }} route={routeItem} stops={stops} flat={flat} active={active} uid={uid} lang={lang} onPick={pick} />
            )}
          </div>
        ) : null}
      </form>

      {!hasQuery && !showList ? (
        <div className={styles.try}>
          <span className={styles.tryLabel}>{t("home.try")}</span>
          {examples.map((ex) => (
            <button key={ex} type="button" className={styles.chip} onClick={() => ask(ex, null, /\s(to|nach)\s/.test(ex))}>
              {ex}
            </button>
          ))}
        </div>
      ) : null}

      {!hasQuery && !showList ? idle : null}

      <div className={styles.results} aria-live="polite">
        {failed ? (
          <p className={styles.message}>{t("q.failed")}</p>
        ) : applied.r ? (
          stops ? (
            <RouteView idx={stops} q={applied.q} lang={lang} ask={ask} />
          ) : stopsFailed ? (
            <p className={styles.message}>{t("rt.failed")}</p>
          ) : (
            <p className={styles.loading}>{t("q.loading", { q: applied.q })}</p>
          )
        ) : applied.s ? (
          stationEntry && ta ? (
            <StationView station={stationEntry} ta={ta} lang={lang} span={span} ask={ask} />
          ) : (
            <p className={styles.loading}>{t("q.loading", { q: applied.s })}</p>
          )
        ) : applied.q && !ready ? (
          <p className={styles.loading}>{t("q.loading", { q: applied.q })}</p>
        ) : ready ? (
          <Answer outcome={ready} u={applied.u} lang={lang} span={span} ask={ask} />
        ) : null}
      </div>
    </div>
  );
}

/** The best-known station on each side: "Köln Hbf", "Berlin Hauptbahnhof". */
function routeHeading(idx: StopsIndex, q: RouteQuery): [string, string] {
  return [idx.raw.stations[q.from[0]], idx.raw.stations[q.to[0]]];
}

function RouteView({
  idx,
  q,
  lang,
  ask,
}: {
  idx: StopsIndex;
  q: string;
  lang: Lang;
  ask: (q: string, u?: string | null, asRoute?: boolean) => void;
}) {
  const t = makeT(lang);
  const diag = useMemo(() => diagnoseRoute(idx, q), [idx, q]);
  const query = diag && "query" in diag ? diag.query : null;
  const found = useMemo(() => (query ? findTrains(idx, query) : []), [idx, query]);
  const hits = useMemo(() => found.filter((h) => h.late !== null), [found]);
  const thin = found.length - hits.length;
  const [all, setAll] = useState(false);
  if (!query) {
    return (
      <div className={styles.none}>
        <p className={styles.noneTitle}>{t("q.noneTitle", { q })}</p>
        {diag && "missing" in diag ? (
          <>
            <p className={styles.message}>{t("rt.unknown", { place: diag.missing })}</p>
            <p className={styles.message}>{t("rt.abroad")}</p>
          </>
        ) : diag && "same" in diag ? (
          <p className={styles.message}>{t("rt.same")}</p>
        ) : (
          <p className={styles.message}>{t("q.noneNoNum")}</p>
        )}
      </div>
    );
  }
  const [from, to] = routeHeading(idx, query);
  const shown = all ? hits : hits.slice(0, 8);
  const win = idx.raw.window;
  return (
    <section className={styles.station} aria-labelledby="route-name">
      <h2 id="route-name" className={styles.stationName}>
        {from}
        <span className={styles.arrow} aria-hidden="true">
          {" → "}
        </span>
        <span className="visually-hidden"> {t("route.to")} </span>
        {to}
      </h2>
      <p className={styles.stationSub}>
        {t("rt.sub", { from, to })} {spanLabel(win.firstMonth, win.lastMonth, lang)}.{" "}
        {query.time !== null ? t("rt.nearTime", { time: clock(query.time) }) : t("rt.earliest")}
      </p>
      {hits.length === 0 ? (
        <div className={styles.none}>
          <p className={styles.message}>{t("rt.none", { from, to })}</p>
          {thin > 0 ? <p className={styles.fine}>{(thin === 1 ? t("rt.thinOne") : t("rt.thin", { n: thin }))}</p> : null}
          <p className={styles.message}>{t("rt.noneHint")}</p>
          <button type="button" className={styles.chip} onClick={() => ask(`${to} ${lang === "de" ? "nach" : "to"} ${from}`, null, true)}>
            {t("rt.reverse", { from, to })}
          </button>
        </div>
      ) : (
        <>
          <div className={styles.rows}>
            {shown.map((h) => (
              <RouteRow key={`${h.type}${h.num}`} hit={h} lang={lang} top={to} onPick={() => ask(`${h.type} ${h.num}`)} />
            ))}
          </div>
          {hits.length > 8 && !all ? (
            <button type="button" className={styles.showAll} onClick={() => setAll(true)}>
              {t("rt.showAll", { n: hits.length })}
            </button>
          ) : null}
          {thin > 0 ? <p className={styles.fine}>{(thin === 1 ? t("rt.thinOne") : t("rt.thin", { n: thin }))}</p> : null}
          <p className={styles.fine}>{t("rt.measuredAt")}</p>
          <p className={styles.fine}>{t("rt.times")}</p>
        </>
      )}
    </section>
  );
}

function RouteRow({ hit, lang, top, onPick }: { hit: RouteHit; lang: Lang; top: string; onPick: () => void }) {
  const t = makeT(lang);
  const place = hit.toName === top ? "" : ` ${hit.toName}`;
  return (
    <div className={styles.row}>
      <button type="button" className={styles.option} onClick={onPick}>
        <span className={styles.optName}>
          {hit.type} {hit.num}
        </span>
        <span className={styles.optRoute}>
          {clock(hit.dep)} → {hit.arr === null ? "" : clock(hit.arr)}
          {place}
        </span>
        <span
          className={styles.optStat}
          style={{ color: lateShareColor(hit.late ?? 0) }}
          aria-label={t("rt.lateAria", { pct: fmtShare(hit.late ?? 0, lang), to: hit.toName })}
        >
          {t("rt.late", { pct: fmtShare(hit.late ?? 0, lang) })}
        </span>
      </button>
    </div>
  );
}

function statText(train: TaTrainEntry, lang: Lang): string {
  return fmtShare(train.late, lang);
}

function Groups({
  suggestions,
  route: routeItem,
  stops,
  flat,
  active,
  uid,
  lang,
  onPick,
}: {
  suggestions: NonNullable<ReturnType<typeof suggest>>;
  route: RouteItem | null;
  stops: StopsIndex | null;
  flat: Item[];
  active: number;
  uid: string;
  lang: Lang;
  onPick: (s: Item) => void;
}) {
  const t = makeT(lang);
  const groups: [Key, Suggestion[]][] = [
    ["sug.trains", suggestions.trains],
    ["sug.lines", suggestions.lines],
    ["sug.stations", suggestions.stations],
  ];
  return (
    <>
      {routeItem && stops ? (
        <div className={styles.group} role="group" aria-label={t("sug.routes")}>
          <p className={styles.groupTitle} aria-hidden="true">
            {t("sug.routes")}
          </p>
          <button
            id={`${uid}-o${flat.indexOf(routeItem)}`}
            type="button"
            role="option"
            aria-selected={flat.indexOf(routeItem) === active}
            className={styles.option}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(routeItem)}
          >
            <span className={styles.optStation}>{routeHeading(stops, routeItem.query).join(" → ")}</span>
            <span className={styles.optStat} style={{ color: "var(--muted)" }}>
              {routeItem.count === 1 ? t("sug.routeCountOne") : t("sug.routeCount", { n: routeItem.count })}
            </span>
          </button>
        </div>
      ) : null}
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <div key={title} className={styles.group} role="group" aria-label={t(title)}>
            <p className={styles.groupTitle} aria-hidden="true">
              {t(title)}
            </p>
            {items.map((s) => {
              const i = flat.indexOf(s as Item);
              return (
                <button
                  key={s.kind === "station" ? `s-${s.station.name}` : s.train.key}
                  id={`${uid}-o${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={styles.option}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(s)}
                >
                  {s.kind === "station" ? (
                    <>
                      <span className={styles.optStation}>{s.station.name}</span>
                      <span className={styles.optStat} style={{ color: "var(--muted)" }}>
                        {s.station.trains.length === 1 ? t("sug.stationOne") : t("sug.stationMany", { n: s.station.trains.length })}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={styles.optName}>{unitName(s.train)}</span>
                      <span className={styles.optRoute}>{`${s.train.origin} ${s.train.kind === 1 ? "↔" : "→"} ${s.train.dest}`}</span>
                      <span
                        className={styles.optStat}
                        style={{ color: lateShareColor(s.train.late) }}
                        aria-label={t("sug.lateAria", { pct: statText(s.train, lang) })}
                      >
                        {t("sug.late", { pct: statText(s.train, lang) })}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
    </>
  );
}

function StationView({
  station,
  ta,
  lang,
  span,
  ask,
}: {
  station: TaStationEntry;
  ta: TaIndex;
  lang: Lang;
  span: string;
  ask: (q: string, u?: string | null) => void;
}) {
  const t = makeT(lang);
  const rows = station.trains.map((i) => ta.trains[i]).sort((a, b) => b.late - a.late || b.measured - a.measured);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <section className={styles.station} aria-labelledby="station-name">
      <h2 id="station-name" className={styles.stationName}>
        {station.name}
      </h2>
      <p className={styles.stationSub}>{t("st.sub", { span })}</p>
      {rows.length === 0 ? (
        <p className={styles.message}>{t("st.empty")}</p>
      ) : (
        <div className={styles.rows}>
          {shown.map((tr) => (
            <div key={tr.key} className={styles.row}>
              <button type="button" className={styles.option} onClick={() => ask(unitName(tr))}>
                <span className={styles.optName}>{unitName(tr)}</span>
                <span className={styles.optRoute}>{`${tr.origin} → ${tr.dest}`}</span>
                <span className={styles.optStat} style={{ color: lateShareColor(tr.late) }}>
                  {t("st.late", { pct: fmtShare(tr.late, lang) })}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {rows.length > 12 && !all ? (
        <button type="button" className={styles.showAll} onClick={() => setAll(true)}>
          {lang === "de" ? `Alle ${rows.length} zeigen` : `Show all ${rows.length}`}
        </button>
      ) : null}
    </section>
  );
}

function UnitButton({ u, selected, lang, onPick }: { u: SearchUnit; selected?: boolean; lang: Lang; onPick: () => void }) {
  const t = makeT(lang);
  return (
    <button type="button" className={`${styles.pick} ${selected ? styles.pickOn : ""}`} onClick={onPick} aria-pressed={selected}>
      <span>
        <span className={styles.pickName}>{unitName(u)}</span>
        <span className={styles.pickKind}>{kindLabel(u, lang)}</span>
      </span>
      <span className={styles.pickRoute}>{routeText(u)}</span>
      <span className={styles.pickStat} style={{ color: lateShareColor(u.late) }}>
        {t("sug.late", { pct: fmtShare1(u.late, lang) })}
      </span>
    </button>
  );
}

/** A long-distance train is fully named by its type and number; a line or regional train is not. */
function keyFor(u: SearchUnit): string | null {
  return u.kind === 0 ? null : u.key;
}

function Answer({
  outcome,
  u,
  lang,
  span,
  ask,
}: {
  outcome: SearchOutcome;
  u: string | null;
  lang: Lang;
  span: string;
  ask: (q: string, u?: string | null) => void;
}) {
  const t = makeT(lang);
  const { parsed, matches } = outcome;
  const min = SEARCH_INDEX.params.searchMinRuns;

  if (outcome.problem === "need-number") {
    return <p className={styles.message}>{t("q.needNumber", { type: parsed.type ?? "" })}</p>;
  }
  if (outcome.problem === "unsupported" && outcome.unsupported) {
    return <p className={styles.message}>{t("q.unsupported", { what: t(`unsup.${outcome.unsupported}` as Key) })}</p>;
  }

  if (matches.length > 0) {
    const selected = matches.length === 1 ? matches[0] : pickByKey(matches, u);
    const note = outcome.typeNote;
    const name = parsed.type ? `${parsed.type} ${parsed.num}` : (parsed.num ?? "");
    return (
      <>
        {note ? (
          <p className={styles.note}>
            {note.used.length > 0
              ? t("q.typeNone", { typed: note.typed, used: note.used.join(` ${t("q.and")} `), num: parsed.num ?? "" })
              : t("q.typeNoneAll", { typed: note.typed, num: parsed.num ?? "" })}
          </p>
        ) : null}
        {matches.length > 1 ? (
          <div className={styles.choose}>
            <p className={styles.chooseTitle}>
              {t("q.choose", { n: matches.length, name })} {selected ? t("q.chooseOne") : t("q.choosePick")}
            </p>
            <ul className={styles.options}>
              {matches.slice(0, 12).map((m) => (
                <li key={m.key}>
                  <UnitButton u={m} lang={lang} selected={selected?.key === m.key} onPick={() => ask(parsed.raw, m.key)} />
                </li>
              ))}
            </ul>
            {matches.length > 12 ? <p className={styles.more}>{t("q.more", { n: matches.length - 12 })}</p> : null}
          </div>
        ) : null}
        {selected ? <SearchResult unit={selected} lang={lang} onOpenLine={(q, key) => ask(q, key)} /> : null}
      </>
    );
  }

  return (
    <div className={styles.none}>
      <p className={styles.noneTitle}>{t("q.noneTitle", { q: parsed.raw })}</p>
      {parsed.num === null ? (
        <p className={styles.message}>{t("q.noneNoNum")}</p>
      ) : (
        <p className={styles.message}>{t("q.noneBody", { min, span })}</p>
      )}
      {outcome.typos.length > 0 ? (
        <Suggestions title={t("q.didYouMean")}>
          {outcome.typos.map((s) => (
            <button key={`${s.type} ${s.num}`} type="button" className={styles.chip} onClick={() => ask(`${s.type} ${s.num}`)}>
              {s.type} {s.num}
            </button>
          ))}
        </Suggestions>
      ) : null}
      {outcome.sameNumber.length > 0 ? (
        <Suggestions title={t("q.trainsNumbered", { num: parsed.num ?? "" })}>
          {outcome.sameNumber.map((s) => (
            <button key={s.key} type="button" className={styles.chip} onClick={() => ask(unitName(s), keyFor(s))}>
              {unitName(s)}
            </button>
          ))}
        </Suggestions>
      ) : null}
      {outcome.prefix.length > 0 ? (
        <Suggestions title={t("q.numbersStarting", { num: parsed.num ?? "" })}>
          {outcome.prefix.map((s) => (
            <button key={s.key} type="button" className={styles.chip} onClick={() => ask(unitName(s), keyFor(s))}>
              {unitName(s)}
            </button>
          ))}
        </Suggestions>
      ) : null}
    </div>
  );
}

function Suggestions({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.suggest}>
      <p className={styles.suggestTitle}>{title}</p>
      <div className={styles.chips}>{children}</div>
    </div>
  );
}
