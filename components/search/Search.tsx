"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { SEARCH_INDEX, loadTypeahead, pickByKey, runSearch, type SearchOutcome } from "@/lib/searchClient";
import { unitName, type SearchUnit } from "@/lib/searchCore";
import { findStation, flatten, suggest, type Suggestion, type TaIndex, type TaStationEntry, type TaTrainEntry } from "@/lib/typeahead";
import { fmt1, fmtShare, fmtShare1, spanLabel } from "@/lib/format";
import { lateShareColor } from "@/lib/colors";
import { route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { SearchResult, kindLabel, routeText } from "./SearchResult";
import styles from "./Search.module.css";

const EXAMPLES = ["ICE 1541", "RE 19", "Köln Hbf"];
const TYPING_DELAY_MS = 220;

interface Applied {
  q: string;
  u: string | null;
  /** Set when the visitor picked a station; the page shows its trains. */
  s: string | null;
}

function readUrl(): Applied {
  const p = new URLSearchParams(window.location.search);
  return { q: (p.get("q") ?? "").trim(), u: p.get("u"), s: p.get("s") };
}

function urlFor(a: Applied): string {
  const p = new URLSearchParams();
  if (a.q) p.set("q", a.q);
  if (a.q && a.u) p.set("u", a.u);
  if (a.s) p.set("s", a.s);
  const s = p.toString();
  return `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
}

/** The home page's search: a big box, live suggestions under it, and the answer below. */
export function Search({ lang, idle, title, sub }: { lang: Lang; idle?: React.ReactNode; title: string; sub: string }) {
  const t = makeT(lang);
  const uid = useId();
  const [text, setText] = useState("");
  const [applied, setApplied] = useState<Applied>({ q: "", u: null, s: null });
  const [answer, setAnswer] = useState<{ q: string; outcome: SearchOutcome } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ta, setTa] = useState<TaIndex | null>(null);
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
  useEffect(() => {
    if (applied.q || applied.s) warm();
  }, [applied.q, applied.s, warm]);

  useEffect(() => {
    if (!applied.q || applied.s) {
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
  }, [applied.q, applied.s]);

  const suggestions = useMemo(() => (ta && text.trim() ? suggest(ta, text) : null), [ta, text]);
  const flat = useMemo(() => (suggestions ? flatten(suggestions) : []), [suggestions]);
  const showList = open && text.trim().length > 0 && applied.q !== text.trim();

  function onType(value: string) {
    setText(value);
    setOpen(true);
    setActive(-1);
    window.clearTimeout(timer.current);
    // A train number resolves while typing; the dropdown is the way to pick anything else.
    timer.current = window.setTimeout(() => {
      if (/^\s*[a-zA-Z]{0,4}\s*\d+[a-zA-Z]?\s*$/.test(value) && /\d{3,}/.test(value)) commit({ q: value.trim(), u: null, s: null }, "replace");
    }, TYPING_DELAY_MS);
  }

  function pick(s: Suggestion) {
    window.clearTimeout(timer.current);
    setOpen(false);
    input.current?.blur();
    if (s.kind === "station") {
      setText(s.station.name);
      commit({ q: s.station.name, u: null, s: s.station.name }, "push");
    } else {
      const name = unitName(s.train);
      setText(name);
      commit({ q: name, u: s.train.kind === 0 ? null : s.train.key, s: null }, "push");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    window.clearTimeout(timer.current);
    const value = text.trim();
    if (!value) return;
    if (active >= 0 && flat[active]) return pick(flat[active]);
    const st = ta ? findStation(ta, value) : null;
    const numeric = /^[a-zA-Z]{0,4}\s*\d/.test(value);
    setOpen(false);
    input.current?.blur();
    if (st && !numeric) {
      setText(st.name);
      commit({ q: st.name, u: null, s: st.name }, "push");
    } else {
      commit({ q: value, u: null, s: null }, "push");
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

  function ask(q: string, u: string | null = null) {
    window.clearTimeout(timer.current);
    setText(q);
    setOpen(false);
    const st = ta ? findStation(ta, q) : null;
    if (st && !/\d/.test(q) && u === null) commit({ q: st.name, u: null, s: st.name }, "push");
    else commit({ q, u, s: null }, "push");
  }

  function clear() {
    window.clearTimeout(timer.current);
    setText("");
    setOpen(false);
    commit({ q: "", u: null, s: null }, "push");
    input.current?.focus();
  }

  const ready = answer !== null && answer.q === applied.q ? answer.outcome : null;
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
            {!ta ? null : flat.length === 0 ? (
              <p className={styles.hint}>{t("sug.empty", { q: text.trim() })}</p>
            ) : (
              <Groups suggestions={suggestions!} flat={flat} active={active} uid={uid} lang={lang} onPick={pick} />
            )}
          </div>
        ) : null}
      </form>

      {!hasQuery && !showList ? (
        <div className={styles.try}>
          <span className={styles.tryLabel}>{t("home.try")}</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className={styles.chip} onClick={() => ask(ex)}>
              {ex}
            </button>
          ))}
        </div>
      ) : null}

      {!hasQuery && !showList ? idle : null}

      <div className={styles.results} aria-live="polite">
        {failed ? (
          <p className={styles.message}>{t("q.failed")}</p>
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

function statText(train: TaTrainEntry, lang: Lang): string {
  return fmtShare(train.late, lang);
}

function Groups({
  suggestions,
  flat,
  active,
  uid,
  lang,
  onPick,
}: {
  suggestions: NonNullable<ReturnType<typeof suggest>>;
  flat: Suggestion[];
  active: number;
  uid: string;
  lang: Lang;
  onPick: (s: Suggestion) => void;
}) {
  const t = makeT(lang);
  const groups: [Key, Suggestion[]][] = [
    ["sug.trains", suggestions.trains],
    ["sug.lines", suggestions.lines],
    ["sug.stations", suggestions.stations],
  ];
  return (
    <>
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <div key={title} className={styles.group} role="group" aria-label={t(title)}>
            <p className={styles.groupTitle} aria-hidden="true">
              {t(title)}
            </p>
            {items.map((s) => {
              const i = flat.indexOf(s);
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
