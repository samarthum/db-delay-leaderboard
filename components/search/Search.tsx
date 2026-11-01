"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SEARCH_INDEX, loadRouteTable, loadStops, loadTypeahead, pickByKey, runSearch, type RouteTable, type SearchOutcome } from "@/lib/searchClient";
import { routeSlug, shortStation } from "@/lib/routeSlug";
import { pageFor, timeParam } from "@/lib/routePage";
import { clock, clockGap, destinations, diagnoseRoute, findTrains, parseRoute, splitRoute, type RouteHit, type RouteQuery, type StopsIndex } from "@/lib/routeSearch";
import { splitLive, unitName, type SearchUnit } from "@/lib/searchCore";
import { didYouMean, findStation, flatten, suggest, type Suggestion, type TaIndex, type TaStationEntry, type TaTrainEntry } from "@/lib/typeahead";
import { fmt1, fmtShare, fmtShare1, spanLabel } from "@/lib/format";
import { delayColor, lateShareColor } from "@/lib/colors";
import { route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { VoiceSession, prefetchToken, voiceConfigured, voiceSupported } from "@/lib/voice";
import { interpretSpoken } from "@/lib/spoken";
import { unitHref } from "@/lib/site";
import { Arrow } from "../Arrow";
import { SearchResult, kindLabel, routeText } from "./SearchResult";
import { VoicePanel, type VoiceView } from "./VoicePanel";
import styles from "./Search.module.css";

/** Examples are typed the way the parser understands them; each says what kind of thing it is, so a chip can never be misread. */
type ExampleKind = "route" | "train" | "station";
interface Example {
  text: string;
  kind: ExampleKind;
}
const EXAMPLES: Example[] = [
  { text: "Köln to Berlin", kind: "route" },
  { text: "ICE 1541", kind: "train" },
  { text: "Hannover Hbf", kind: "station" },
];
const EXAMPLES_DE: Example[] = [
  { text: "Köln nach Berlin", kind: "route" },
  { text: "ICE 1541", kind: "train" },
  { text: "Hannover Hbf", kind: "station" },
];
/** What the box understands, one line each: shown when the box is focused and empty, and when a search finds nothing. */
const HELP: { en: string; de: string; kind: ExampleKind; key: Key }[] = [
  { en: "ICE 1541", de: "ICE 1541", kind: "train", key: "help.train" },
  { en: "Köln to Berlin", de: "Köln nach Berlin", kind: "route", key: "help.route" },
  { en: "8:25 Köln to Berlin", de: "8:25 Köln nach Berlin", kind: "route", key: "help.time" },
  { en: "Hannover Hbf", de: "Hannover Hbf", kind: "station", key: "help.station" },
];
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
  /** Share of the route's trips 15+ min late, when the pair has a route page (picking it opens that page). */
  late: number | null;
  /** Average minutes late on that route page. */
  avg: number | null;
}
/** "8:14 Köln to Berlin": the train that leaves nearest that time, offered above the route itself. */
interface AtItem {
  kind: "at";
  hit: RouteHit;
}
/** "Köln to" suggests a destination; picking it completes the route. */
interface DestItem {
  kind: "dest";
  name: string;
  trains: number;
  /** The full text to search once picked: "Köln to Berlin Hauptbahnhof". */
  text: string;
}
type Item = Suggestion | AtItem | RouteItem | DestItem;

function readUrl(): Applied {
  const p = new URLSearchParams(window.location.search);
  return { q: (p.get("q") ?? "").trim(), u: p.get("u"), s: p.get("s"), r: p.get("r") === "1" };
}

function urlFor(a: Applied, path?: string): string {
  const p = new URLSearchParams();
  if (a.q) p.set("q", a.q);
  if (a.q && a.u) p.set("u", a.u);
  if (a.s) p.set("s", a.s);
  if (a.q && a.r) p.set("r", "1");
  const s = p.toString();
  return path ? `${path}${s ? `?${s}` : ""}` : `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
}

/** The home page's search: a big box, live suggestions under it, and the answer below. */
export function Search({
  lang,
  idle,
  figure,
  title,
  variant = "home",
  initial,
  shortcuts,
}: {
  lang: Lang;
  /** Blocks under the box while nothing is searched (the change tool, the top routes). */
  idle?: React.ReactNode;
  /** The answer a page opens with, shown above the box while nothing is searched. */
  figure?: React.ReactNode;
  title?: string;
  /** "inline" is a compact box that answers on the home page; "sheet" is the same inside the header's search sheet. */
  variant?: "home" | "inline" | "sheet";
  /** Text to start with instead of the address's query (the sheet opened as "Hannover Hbf to "). */
  initial?: string;
  /** The sheet's own shortcuts (your trains, recent pages), shown above "You can type" while the box is empty. */
  shortcuts?: React.ReactNode;
}) {
  const t = makeT(lang);
  const uid = useId();
  const [text, setText] = useState("");
  const [applied, setApplied] = useState<Applied>({ q: "", u: null, s: null, r: false });
  const [answer, setAnswer] = useState<{ q: string; outcome: SearchOutcome } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ta, setTa] = useState<TaIndex | null>(null);
  const [stops, setStops] = useState<StopsIndex | null>(null);
  const [stopsFailed, setStopsFailed] = useState(false);
  const [table, setTable] = useState<RouteTable | null>(null);
  const tableRef = useRef<RouteTable | null>(null);
  tableRef.current = table;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<number | undefined>(undefined);
  const stopsRef = useRef<StopsIndex | null>(null);
  stopsRef.current = stops;
  const input = useRef<HTMLInputElement>(null);
  // Phones: the home box is a door to the full-screen search sheet (same as the header magnifier on other pages).
  const [asDoor, setAsDoor] = useState(false);
  useEffect(() => {
    if (variant !== "home") return;
    const mq = window.matchMedia("(max-width: 959px)");
    const set = () => setAsDoor(mq.matches && !window.location.search);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, [variant]);

  // Voice: the mic button lives in the box; the panel under it shows the level and the words as they are heard.
  const [voice, setVoice] = useState<VoiceView>({ phase: "idle" });
  const [voiceOk, setVoiceOk] = useState(false);
  const session = useRef<VoiceSession | null>(null);
  const goTimer = useRef<number | undefined>(undefined);
  const askRef = useRef<((q: string, u?: string | null, asRoute?: boolean) => void) | null>(null);
  useEffect(() => {
    let live = true;
    if (voiceSupported()) {
      voiceConfigured().then((ok) => {
        if (!live) return;
        setVoiceOk(ok);
        if (ok) prefetchToken();
      });
    }
    return () => {
      live = false;
      session.current?.cancel();
      window.clearTimeout(goTimer.current);
    };
  }, []);

  const commit = useCallback((next: Applied, mode: "push" | "replace") => {
    // The compact box on a route or train page answers on the home page, so the page the visitor came from stays as it was.
    if (variant !== "home") {
      if (!next.q && !next.s) return;
      const href = urlFor(next, route(lang, "home"));
      // Already on the home page (the sheet was opened from its box): the router would keep the mounted page, which
      // reads the address only on load. Change the address and tell the home search to read it again.
      if (window.location.pathname === route(lang, "home")) {
        window.history.pushState(null, "", href);
        window.dispatchEvent(new Event("gp:url"));
      } else router.push(href);
      return;
    }
    const href = urlFor(next);
    if (href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      if (mode === "push") window.history.pushState(null, "", href);
      else window.history.replaceState(null, "", href);
    }
    setApplied(next);
  }, [variant, router, lang]);

  // The page's own address is the state: read it on load and on back/forward.
  useEffect(() => {
    const sync = () => {
      const url = readUrl();
      setText(url.s ?? url.q);
      setApplied(url);
      setOpen(false);
    };
    sync();
    if (initial !== undefined) {
      setText(initial);
      setOpen(Boolean(initial));
      if (variant === "sheet") setApplied({ q: "", u: null, s: null, r: false });
    }
    window.addEventListener("popstate", sync);
    if (variant === "home") window.addEventListener("gp:url", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("gp:url", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // Fetch the typeahead index on first focus, or right away when the address names a query.
  const warm = useCallback(() => {
    loadTypeahead().then(setTa, () => undefined);
  }, []);
  const warmStops = useCallback(() => {
    loadStops().then(setStops, () => setStopsFailed(true));
    loadRouteTable().then(setTable);
  }, []);
  useEffect(() => {
    if (applied.q || applied.s) warm();
    if (applied.r) warmStops();
  }, [applied.q, applied.s, applied.r, warm, warmStops]);

  const live = useMemo(() => splitLive(applied.q), [applied.q]);
  useEffect(() => {
    if (!applied.q || applied.s || applied.r || !live.text) {
      setAnswer(null);
      setFailed(false);
      return;
    }
    let current = true;
    setFailed(false);
    runSearch(live.text).then(
      (outcome) => current && setAnswer({ q: applied.q, outcome }),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [applied.q, applied.s, applied.r, live.text]);

  const suggestions = useMemo(() => (ta && text.trim() ? suggest(ta, text) : null), [ta, text]);
  const routeItem = useMemo<RouteItem | null>(() => {
    if (!stops || !text.trim()) return null;
    const query = parseRoute(stops, text);
    if (!query) return null;
    const slug = table ? pageFor(stops, query, table) : null;
    if (slug && table) return { kind: "route", query, count: table[slug].t.length, late: table[slug].l, avg: table[slug].a ?? null };
    return { kind: "route", query, count: findTrains(stops, query).length, late: null, avg: null };
  }, [stops, table, text]);
  const atItem = useMemo<AtItem | null>(() => {
    if (!stops || !routeItem || routeItem.query.time === null) return null;
    const time = routeItem.query.time;
    // A pair with a route page: the same train that page marks (its list holds the trains that ran lately), so the
    // suggestion and the page never disagree. Otherwise the nearest train from the per-stop data.
    const slug = table ? pageFor(stops, routeItem.query, table) : null;
    const rows = slug && table ? table[slug].t.filter((e) => typeof e[5] === "number") : [];
    if (rows.length) {
      const e = [...rows].sort((a, b) => clockGap(a[5] as number, time) - clockGap(b[5] as number, time) || (a[5] as number) - (b[5] as number))[0];
      const [from, to] = routeHeading(stops, routeItem.query);
      return { kind: "at", hit: { type: e[0], num: e[1], dep: e[5] as number, arr: e[6] ?? null, fromName: from, toName: to, late: e[2], avg: e[4] ?? null } as RouteHit };
    }
    const hit = findTrains(stops, routeItem.query)[0];
    return hit ? { kind: "at", hit } : null;
  }, [stops, routeItem, table]);
  // An address like /?q=Köln+to+Berlin&r=1 (an old link, a bookmark) goes to the route page when the pair has one.
  const pageTarget = useMemo(() => {
    if (!applied.r || !stops || !table) return null;
    const query = parseRoute(stops, applied.q);
    const slug = query ? pageFor(stops, query, table) : null;
    return slug && query ? route(lang, "route", slug) + (query.time !== null ? `?t=${timeParam(query.time)}` : "") : null;
  }, [applied.r, applied.q, stops, table, lang]);
  useEffect(() => {
    if (pageTarget) router.replace(pageTarget);
  }, [pageTarget, router]);
  const dests = useMemo<DestItem[]>(() => {
    if (!stops || !text.trim()) return [];
    const d = destinations(stops, text);
    if (!d) return [];
    const sep = lang === "de" ? "nach" : "to";
    const lead = d.time !== null ? `${clock(d.time)} ` : "";
    return d.options.map((o) => ({ kind: "dest", name: o.name, trains: o.trains, text: `${lead}${d.fromText} ${sep} ${o.name}` }));
  }, [stops, text, lang]);
  // The route row already names its destination: list only the other stations under "Other destinations".
  const destsShown = useMemo(() => {
    if (!routeItem || !stops) return dests;
    const to = shortStation(routeHeading(stops, routeItem.query)[1]);
    return dests.filter((d) => shortStation(d.name) !== to);
  }, [dests, routeItem, stops]);
  // With a separator typed the question is a route: offer destinations, not train and station matches.
  const flat = useMemo<Item[]>(
    () => [...(atItem ? [atItem] : []), ...(routeItem ? [routeItem] : []), ...destsShown, ...(suggestions && dests.length === 0 && !routeItem ? flatten(suggestions) : [])],
    [atItem, routeItem, dests, destsShown, suggestions],
  );
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
      // A complete route ("Köln to Be") shows its trains while you type, without pressing Enter.
      if (stopsRef.current && tableRef.current && splitRoute(value)) {
        const query = parseRoute(stopsRef.current, value);
        if (query) {
          // With a route page the dropdown offers it; the inline list is only for pairs without one.
          if (!pageFor(stopsRef.current, query, tableRef.current)) commit({ q: value.trim(), u: null, s: null, r: true }, "replace");
          return;
        }
      }
      if (/^\s*[a-zA-Z]{0,4}\s*\d+[a-zA-Z]?\s*$/.test(value) && /\d{3,}/.test(value)) commit({ q: value.trim(), u: null, s: null, r: false }, "replace");
    }, TYPING_DELAY_MS);
  }

  /** Open the route page for the text when the pair has one (with the time, if one was typed); else show the inline list. */
  function openRoute(value: string) {
    const fallback = () => commit({ q: value, u: null, s: null, r: true }, "push");
    Promise.all([stopsRef.current ?? loadStops(), tableRef.current ?? loadRouteTable()]).then(([idx, tbl]) => {
      const query = parseRoute(idx, value);
      const slug = query ? pageFor(idx, query, tbl) : null;
      if (slug && query) router.push(route(lang, "route", slug) + (query.time !== null ? `?t=${timeParam(query.time)}` : ""));
      else fallback();
    }, () => commit({ q: value, u: null, s: null, r: false }, "push"));
  }

  function pick(s: Item) {
    window.clearTimeout(timer.current);
    setOpen(false);
    input.current?.blur();
    if (s.kind === "at") {
      const name = `${s.hit.type} ${s.hit.num}`;
      setText(name);
      commit({ q: name, u: null, s: null, r: false }, "push");
    } else if (s.kind === "route") {
      openRoute(text.trim());
    } else if (s.kind === "dest") {
      setText(s.text);
      openRoute(s.text);
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
    const raw = text.trim();
    if (!raw) return;
    if (active >= 0 && flat[active]) return pick(flat[active]);
    // Words about right now ("today", "heute") are taken out for the lookup; a train query keeps them so the page can say it is not live.
    const sl = splitLive(raw);
    const value = sl.text || raw;
    // "Köln to" with nothing after it is not a question yet: keep the destinations on screen.
    const partial = stops ? destinations(stops, value) : null;
    if (partial && !partial.prefix) {
      setOpen(true);
      return;
    }
    setOpen(false);
    input.current?.blur();
    // A route wins over a lookalike: "Köln Berlin" is a trip, not a station.
    if (routeItem || (stops && splitRoute(value))) return openRoute(value);
    // The per-stop data may still be loading, or the text may only look like a route: decide once it is here.
    if (!stops && /\s|→|->|\d:\d/.test(value) && /\s(to|nach)\s|→|->/i.test(value)) {
      loadStops().then(
        (idx) => {
          setStops(idx);
          const partial = destinations(idx, value);
          if (partial && !partial.prefix) {
            setOpen(true);
            input.current?.focus();
            return;
          }
          const query = parseRoute(idx, value);
          if (query || splitRoute(value)) openRoute(value);
          else commit({ q: raw, u: null, s: null, r: false }, "push");
        },
        () => commit({ q: raw, u: null, s: null, r: false }, "push"),
      );
      return;
    }
    const st = ta ? findStation(ta, value) : null;
    const numeric = /^[a-zA-Z]{0,4}\s*\d/.test(value);
    if (st && !numeric) {
      setText(st.name);
      commit({ q: st.name, u: null, s: st.name, r: false }, "push");
    } else {
      commit({ q: raw, u: null, s: null, r: false }, "push");
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
    if (asRoute) return openRoute(q);
    const st = ta ? findStation(ta, q) : null;
    if (st && !/\d/.test(q) && u === null) commit({ q: st.name, u: null, s: st.name, r: false }, "push");
    else commit({ q, u, s: null, r: false }, "push");
  }
  askRef.current = ask;

  /** A station is a station: no guessing from the text, so an example chip works before the index has loaded. */
  function askStation(name: string) {
    window.clearTimeout(timer.current);
    setText(name);
    setOpen(false);
    input.current?.blur();
    commit({ q: name, u: null, s: name, r: false }, "push");
  }
  function askExample(kind: ExampleKind, text: string) {
    if (kind === "station") askStation(text);
    else if (kind === "route") ask(text, null, true);
    else ask(text);
  }

  /** "Hannover Hbf to ": the box, focused, ready for the destination (the suggestions list destinations from there). */
  function startRoute(from: string) {
    const v = `${from} ${lang === "de" ? "nach" : "to"} `;
    if (asDoor || window.innerWidth < 960) {
      window.dispatchEvent(new CustomEvent("gp:search", { detail: v }));
      return;
    }
    setText(v);
    setOpen(true);
    warmStops();
    input.current?.focus();
  }

  function startVoice() {
    session.current?.cancel();
    window.clearTimeout(goTimer.current);
    window.clearTimeout(timer.current);
    setOpen(false);
    input.current?.blur();
    warm();
    warmStops();
    setVoice({ phase: "starting" });
    const s = new VoiceSession({
      onListening: () => setVoice({ phase: "listening", partial: "" }),
      onPartial: (partial) => setVoice({ phase: "listening", partial }),
      onFinal: (raw) => void finishVoice(raw),
      onError: (error) => setVoice({ phase: "error", error }),
    });
    session.current = s;
    s.start();
  }

  function stopVoice() {
    session.current?.stop();
  }

  function closeVoice() {
    session.current?.cancel();
    window.clearTimeout(goTimer.current);
    setVoice({ phase: "idle" });
  }

  /** The words are in: turn them into a search, show what was understood for a moment, then run it. */
  async function finishVoice(raw: string) {
    let idx = stopsRef.current;
    if (!idx) idx = await loadStops().catch(() => null);
    const heard = interpretSpoken(idx, raw, lang);
    if (!heard.text) return setVoice({ phase: "error", error: "nospeech" });
    setVoice({ phase: "heard", text: heard.text });
    setText(heard.text);
    const asRoute = heard.kind === "route" || Boolean(idx && parseRoute(idx, heard.text));
    goTimer.current = window.setTimeout(() => {
      setVoice({ phase: "idle" });
      askRef.current?.(heard.text, null, asRoute);
    }, 900);
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
  const routeish = /\s|→|->|\d:\d/.test(text.trim());
  const indexLoading = !ta || (routeish && !stops && !stopsFailed);
  const showHelp = (open || variant === "sheet") && !text.trim() && !applied.q && !applied.s && voice.phase === "idle";
  const stationEntry: TaStationEntry | null = ta && applied.s ? (ta.stations.find((s) => s.name === applied.s) ?? null) : null;
  const span = spanLabel(SEARCH_INDEX.window.firstMonth, SEARCH_INDEX.window.lastMonth, lang);
  const listId = `${uid}-list`;

  const hasQuery = Boolean(applied.q || applied.s);

  // A train or line that resolves to one page opens that page, like a route does: the visitor lands on the destination, not on a copy of it.
  const shown = ready && ready.matches.length > 0 ? (ready.matches.length === 1 ? ready.matches[0] : pickByKey(ready.matches, applied.u)) : null;
  // A corrected type ("ICEE 1541" -> ICE) stays here with its note: a silent jump would hide that the visitor typed something else.
  const pageHref = shown?.slug && !ready?.typeNote ? unitHref({ category: shown.kind === 0 ? "longDistance" : "regional", slug: shown.slug }, lang) : null;
  useEffect(() => {
    if (pageHref) router.replace(pageHref);
  }, [pageHref, router]);

  // A name that is exactly one station ("Köln Hbf" from a link or an example) is that station's view, not a train query.
  const noMatch = ready?.problem === "no-match" ? live.text : null;
  const station1 = useMemo(() => (noMatch && ta ? findStation(ta, noMatch) : null), [noMatch, ta]);
  useEffect(() => {
    if (station1 && !applied.s) {
      setText(station1.name);
      commit({ q: station1.name, u: null, s: station1.name, r: false }, "replace");
    }
  }, [station1, applied.s, commit]);

  return (
    <div className={styles.root} data-active={hasQuery || undefined} data-variant={variant}>
      {title ? (
        <div className={styles.intro}>
          <h1 className={hasQuery ? "h1 visually-hidden" : "h1"}>{title}</h1>
        </div>
      ) : null}
      {hasQuery || !figure ? null : <div className={styles.figureWrap}>{figure}</div>}
      <form className={styles.field} role="search" onSubmit={submit} autoComplete="off">
        <label htmlFor={`${uid}-q`} className={variant === "sheet" ? "visually-hidden" : styles.label}>
          {variant !== "home" ? (
            <>
              {t("own.label")}
            </>
          ) : (
            t("home.find")
          )}
        </label>
        <div className={styles.anchor}>
        <div className={styles.inputWrap}>
          <input
            ref={input}
            id={`${uid}-q`}
            className={styles.input}
            type="search"
            name="q"
            value={text}
            onChange={(e) => onType(e.target.value)}
            readOnly={asDoor}
            onClick={() => {
              if (asDoor) window.dispatchEvent(new CustomEvent("gp:search"));
            }}
            onFocus={(e) => {
              if (asDoor) return;
              warm();
              warmStops();
              setOpen(true);
              // On a phone the suggestions float under the box: bring the box to the top so they fit above the tab bar.
              if (window.innerWidth < 960) e.currentTarget.closest("form")?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 160)}
            onKeyDown={onKeyDown}
            placeholder={t("home.ph")}
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
          {voiceOk ? (
            <button type="button" className={styles.mic} onClick={startVoice} aria-label={t("voice.start")} data-on={voice.phase !== "idle" || undefined}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            </button>
          ) : null}
          <button type="submit" className={styles.go} aria-label={t("home.go")}>
            <Arrow />
          </button>
        </div>

        {showList ? (
          <div id={listId} className={styles.list} role="listbox" aria-label={t("sug.list")}>
            {flat.length === 0 && indexLoading ? (
              <p className={styles.hint}>{t("sug.loading")}</p>
            ) : flat.length === 0 ? (
              <p className={styles.hint}>{t("sug.empty", { q: text.trim() })}</p>
            ) : (
              <Groups suggestions={suggestions && dests.length === 0 && !routeItem ? suggestions : { trains: [], lines: [], stations: [] }} route={routeItem} at={atItem} dests={destsShown} stops={stops} flat={flat} active={active} uid={uid} lang={lang} onPick={pick} />
            )}
          </div>
        ) : null}
          {showHelp && shortcuts ? shortcuts : null}
          {showHelp ? (
            <div className={variant === "sheet" ? styles.helpStatic : styles.help} role="group" aria-label={t("help.title")}>
              <p className={styles.helpTitle}>{t("help.title")}</p>
              <ul>
                {HELP.map((h) => (
                  <li key={h.key}>
                    <button type="button" className={styles.helpItem} onMouseDown={(e) => e.preventDefault()} onClick={() => askExample(h.kind, lang === "de" ? h.de : h.en)}>
                      <b>{lang === "de" ? h.de : h.en}</b>
                      <span>{t(h.key)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </form>

      <VoicePanel view={voice} lang={lang} getLevel={() => session.current?.level ?? 0} onStop={stopVoice} onCancel={closeVoice} onRetry={startVoice} />

      {variant === "inline" && !hasQuery && voice.phase === "idle" ? (
        <p className={styles.eg}>
          <span>{t("home.egLabel")}:</span>
          {examples.map((ex) => (
            <button key={ex.text} type="button" className={styles.egLink} onClick={() => askExample(ex.kind, ex.text)}>
              {ex.text}
            </button>
          ))}
        </p>
      ) : null}


      {!hasQuery && idle ? <div className={styles.idle}>{idle}</div> : null}

      <div className={styles.results} aria-live="polite">
        {applied.q && !live.text && !applied.s && !applied.r ? <NoMatch q={applied.q} ta={ta} lang={lang} askStation={askStation} askExample={askExample} /> : failed ? (
          <p className={styles.message}>{t("q.failed")}</p>
        ) : applied.r ? (
          stops && table ? (
            pageTarget ? (
              <p className={styles.loading}>{t("q.loading", { q: applied.q })}</p>
            ) : (
              <RouteView idx={stops} q={applied.q} lang={lang} ask={ask} />
            )
          ) : stopsFailed ? (
            <p className={styles.message}>{t("rt.failed")}</p>
          ) : (
            <p className={styles.loading}>{t("q.loading", { q: applied.q })}</p>
          )
        ) : applied.s ? (
          stationEntry && ta ? (
            <StationView station={stationEntry} ta={ta} lang={lang} span={span} ask={ask} startRoute={startRoute} />
          ) : (
            <p className={styles.loading}>{t("q.loading", { q: applied.s })}</p>
          )
        ) : applied.q && !ready ? (
          <p className={styles.loading}>{t("q.loading", { q: applied.q })}</p>
        ) : ready && (pageHref || station1) ? (
          <p className={styles.loading}>{t("q.loading", { q: applied.q })}</p>
        ) : ready ? (
          <Answer outcome={ready} u={applied.u} lang={lang} span={span} ask={ask} ta={ta} askStation={askStation} askExample={askExample} />
        ) : null}
      </div>
    </div>
  );
}

/** The best-known station on each side: "Köln Hbf", "Berlin Hauptbahnhof". */
function routeHeading(idx: StopsIndex, q: RouteQuery): [string, string] {
  const from = q.from.length ? idx.raw.stations[q.from[0]] : idx.raw.foreign[(q.fromForeign ?? [])[0]];
  return [from, q.to.length ? idx.raw.stations[q.to[0]] : idx.raw.foreign[q.toForeign[0]]];
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
  const [all, setAll] = useState(false);
  const [table, setTable] = useState<RouteTable | null>(null);
  useEffect(() => {
    loadRouteTable().then(setTable);
  }, []);
  // A pair with a route page: use that page's exact numbers (only trips that stop at both stations), so the two agree.
  const heading = query ? routeHeading(idx, query) : null;
  const pageSlug = heading && query && query.to.length && query.from.length ? routeSlug(heading[0], heading[1]) : null;
  const exact = pageSlug && table ? table[pageSlug] : undefined;
  const hits = useMemo(() => {
    if (!exact) return found;
    const byTrain = new Map(exact.t.map((e) => [`${e[0]} ${e[1]}`, e]));
    return found.map((h) => {
      const e = byTrain.get(`${h.type} ${h.num}`);
      return e && routeSlug(h.fromName, h.toName) === pageSlug ? { ...h, late: e[2], measured: e[3] } : h;
    });
  }, [found, exact, pageSlug]);
  if (!query) {
    return (
      <div className={styles.none}>
        <p className={styles.noneTitle}>{t("q.noneTitle", { q })}</p>
        {diag && "missing" in diag ? (
          <>
            <p className={styles.message}>{t("rt.unknown", { place: diag.missing })}</p>
            <p className={styles.message}>{t("rt.abroad")}</p>
          </>
        ) : diag && "fromAbroad" in diag ? (
          <p className={styles.message}>{t("rt.fromAbroad", { place: diag.fromAbroad })}</p>
        ) : diag && "same" in diag ? (
          <p className={styles.message}>{t("rt.same")}</p>
        ) : (
          <p className={styles.message}>{t("q.noneNoNum")}</p>
        )}
      </div>
    );
  }
  const [from, to] = routeHeading(idx, query);
  const abroad = query.to.length === 0;
  const shown = all ? hits : hits.slice(0, 8);
  const win = idx.raw.window;
  return (
    <section className={styles.station} aria-labelledby="route-name">
      <h2 id="route-name" className={styles.stationName}>
        {shortStation(from)}
        <span className={styles.arrow} aria-hidden="true">
          {" → "}
        </span>
        <span className="visually-hidden"> {t("route.to")} </span>
        {shortStation(to)}
      </h2>
      <p className={styles.stationSub}>
        {t(abroad ? "rt.subAbroad" : query.fromForeign?.length ? "rt.subFromAbroad" : "rt.sub", { from, to })} {spanLabel(win.firstMonth, win.lastMonth, lang)}.{" "}
        {query.time !== null ? t("rt.nearTime", { time: clock(query.time) }) : t("rt.earliest")}
      </p>
      {exact && pageSlug ? (
        <Link href={route(lang, "route", pageSlug)} className={styles.full} prefetch={false}>
          {t("route.full")} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
      {hits.length === 0 ? (
        <div className={styles.none}>
          <p className={styles.message}>{t("rt.none", { from, to })}</p>
          <p className={styles.message}>{t("rt.noneHint")}</p>
          {abroad || query.fromForeign?.length ? null : (
            <button type="button" className={styles.chip} onClick={() => ask(`${to} ${lang === "de" ? "nach" : "to"} ${from}`, null, true)}>
              {t("rt.reverse", { from, to })}
            </button>
          )}
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
          <p className={styles.fine}>{t(abroad ? "rt.border" : query.fromForeign?.length ? "rt.fromBorder" : "rt.measuredAt")}</p>
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
          {hit.fromAbroad ? `${shortStation(hit.fromName)} ` : ""}{clock(hit.dep)} → {hit.arr === null ? "" : clock(hit.arr)}
          {place}
        </span>
        {hit.late === null ? (
          <span className={styles.optStat} style={{ color: "var(--muted)" }}>
            {t("rt.few")}
          </span>
        ) : (
          <span
            className={styles.optStat}
            style={{ color: lateShareColor(hit.late) }}
            aria-label={t("rt.lateAria", { pct: fmtShare(hit.late, lang), to: hit.toName })}
          >
            {t("rt.late", { pct: fmtShare(hit.late, lang) })}
          </span>
        )}
      </button>
    </div>
  );
}

function statText(train: TaTrainEntry, lang: Lang): string {
  return train.avg === null ? fmtShare(train.late, lang) : fmt1(Math.max(0, train.avg), lang);
}

function Groups({
  suggestions,
  route: routeItem,
  at,
  dests,
  stops,
  flat,
  active,
  uid,
  lang,
  onPick,
}: {
  suggestions: NonNullable<ReturnType<typeof suggest>>;
  route: RouteItem | null;
  at: AtItem | null;
  dests: DestItem[];
  stops: StopsIndex | null;
  flat: Item[];
  active: number;
  uid: string;
  lang: Lang;
  onPick: (s: Item) => void;
}) {
  const t = makeT(lang);
  const groups: [Key, Suggestion[]][] = [
    ["sug.trainsAvg", suggestions.trains],
    ["sug.lines", suggestions.lines],
    ["sug.stations", suggestions.stations],
  ];
  return (
    <>
      {at ? (
        <div className={styles.group} role="group" aria-label={t("sug.yourTrain")}>
          <p className={styles.groupTitle} aria-hidden="true">
            {t("sug.yourTrain")}
          </p>
          <button
            id={`${uid}-o${flat.indexOf(at)}`}
            type="button"
            role="option"
            aria-selected={flat.indexOf(at) === active}
            className={styles.option}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(at)}
          >
            <span className={styles.optName}>
              {at.hit.type} {at.hit.num}
            </span>
            <span className={styles.optRoute}>
              {clock(at.hit.dep)} {shortStation(at.hit.fromName)} → {at.hit.arr === null ? "" : `${clock(at.hit.arr)} `}
              {shortStation(at.hit.toName)}
            </span>
            {at.hit.avg !== null && at.hit.late !== null ? (
              <span className={styles.optStat} style={{ color: delayColor(at.hit.avg) }}>
                {t("list.avg", { x: fmt1(Math.max(0, at.hit.avg), lang) })}
              </span>
            ) : (
              <span className={styles.optStat} style={{ color: "var(--muted)" }}>
                {t("rt.few")}
              </span>
            )}
          </button>
        </div>
      ) : null}
      {routeItem && stops ? (
        <div className={styles.group} role="group" aria-label={t(routeItem.avg !== null ? "sug.routeAvg" : "sug.routes")}>
          <p className={styles.groupTitle} aria-hidden="true">
            {t(routeItem.avg !== null ? "sug.routeAvg" : "sug.routes")}
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
            <span className={styles.optStation}>
              {routeHeading(stops, routeItem.query).map(shortStation).join(" → ")}
              {routeItem.query.time !== null ? <small className={styles.optSub}>{t("sug.routeNear", { time: clock(routeItem.query.time) })}</small> : null}
            </span>
            {routeItem.avg !== null ? (
              <span className={styles.optStat} style={{ color: delayColor(routeItem.avg) }}>
                {t("list.avg", { x: fmt1(Math.max(0, routeItem.avg), lang) })}
              </span>
            ) : routeItem.late !== null ? (
              <span className={styles.optStat} style={{ color: lateShareColor(routeItem.late) }}>
                {t("rt.late", { pct: fmtShare(routeItem.late, lang) })}
              </span>
            ) : (
              <span className={styles.optStat} style={{ color: "var(--muted)" }}>
                {routeItem.count === 1 ? t("sug.routeCountOne") : t("sug.routeCount", { n: routeItem.count })}
              </span>
            )}
          </button>
        </div>
      ) : null}
      {dests.length > 0 ? (
        <div className={styles.group} role="group" aria-label={t(routeItem ? "sug.otherDest" : "sug.stations")}>
          <p className={styles.groupTitle} aria-hidden="true">
            {t(routeItem ? "sug.otherDest" : "sug.stations")}
          </p>
          {dests.map((d) => {
            const i = flat.indexOf(d);
            return (
              <button
                key={d.name}
                id={`${uid}-o${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={styles.option}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(d)}
              >
                <span className={styles.optStation}>{shortStation(d.name)}</span>
                <span className={styles.optStat} style={{ color: "var(--muted)" }}>
                  {routeItem ? "" : d.trains === 1 ? t("sug.routeCountOne") : t("sug.routeCount", { n: d.trains })}
                </span>
              </button>
            );
          })}
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
                      <span className={styles.optStation}>{shortStation(s.station.name)}</span>
                      <span className={styles.optStat} style={{ color: "var(--muted)" }}>
                        {s.station.trains.length === 1 ? t("sug.stationOne") : t("sug.stationMany", { n: s.station.trains.length })}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={styles.optName}>{unitName(s.train)}</span>
                      <span className={styles.optRoute}>{`${shortStation(s.train.origin)} ${s.train.kind === 1 ? "↔" : "→"} ${shortStation(s.train.dest)}`}</span>
                      <span
                        className={styles.optStat}
                        style={{ color: s.train.avg === null ? lateShareColor(s.train.late) : delayColor(s.train.avg) }}
                        aria-label={s.train.avg === null ? t("sug.lateAria", { pct: statText(s.train, lang) }) : t("sug.avg", { x: statText(s.train, lang) })}
                      >
                        {s.train.avg === null ? t("sug.late", { pct: statText(s.train, lang) }) : t("list.avg", { x: statText(s.train, lang) })}
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
  startRoute,
}: {
  station: TaStationEntry;
  ta: TaIndex;
  lang: Lang;
  span: string;
  ask: (q: string, u?: string | null) => void;
  /** Puts "Hannover Hbf to " in the box and focuses it, for a train that only passes through. */
  startRoute: (from: string) => void;
}) {
  const t = makeT(lang);
  const rows = station.trains.map((i) => ta.trains[i]).sort((a, b) => (b.avg ?? b.late) - (a.avg ?? a.late) || b.measured - a.measured);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <section className={styles.station} aria-labelledby="station-name">
      <h2 id="station-name" className={styles.stationName}>
        {shortStation(station.name)}
      </h2>
      <p className={styles.stationSub}>{t("st.sub", { span })}</p>
      <button type="button" className={`rowlink ${styles.through}`} onClick={() => startRoute(shortStation(station.name))}>
        <span>
          {t("st.where", { station: shortStation(station.name) })}
          <small>{t("st.whereSub")}</small>
        </span>
      </button>
      {rows.length === 0 ? (
        <p className={styles.message}>{t("st.empty")}</p>
      ) : (
        <div className={styles.rows}>
          {shown.map((tr) => (
            <div key={tr.key} className={styles.row}>
              <button type="button" className={styles.option} onClick={() => ask(unitName(tr))}>
                <span className={styles.optName}>{unitName(tr)}</span>
                <span className={`${styles.optRoute} ${styles.optWrap}`}>{`${shortStation(tr.origin)} → ${shortStation(tr.dest)}`}</span>
                <span className={styles.optStat} style={{ color: tr.avg === null ? lateShareColor(tr.late) : delayColor(tr.avg) }}>
                  {tr.avg === null ? t("st.late", { pct: fmtShare(tr.late, lang) }) : t("list.avg", { x: fmt1(Math.max(0, tr.avg), lang) })}
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
      <span className={styles.pickStat} style={{ color: delayColor(u.avg) }}>
        {t("sug.avg", { x: fmt1(Math.max(0, u.avg), lang) })}
      </span>
    </button>
  );
}

/** A long-distance train is fully named by its type and number; a line or regional train is not. */
function keyFor(u: SearchUnit): string | null {
  return u.kind === 0 ? null : u.key;
}

/**
 * A query that is not a train: a city with several stations gets a picker, a near miss gets "did you mean", anything
 * else gets the list of what the box understands. Never "add the train number after BERLIN".
 */
function NoMatch({
  q,
  ta,
  lang,
  askStation,
  askExample,
}: {
  q: string;
  ta: TaIndex | null;
  lang: Lang;
  askStation: (name: string) => void;
  askExample: (kind: ExampleKind, text: string) => void;
}) {
  const t = makeT(lang);
  const found = ta && q.trim() ? suggest(ta, q).stations.map((s) => (s.kind === "station" ? s.station : null)).filter((s): s is TaStationEntry => s !== null) : [];
  if (found.length > 1) {
    return (
      <section className={styles.picker} aria-labelledby="pick-title">
        <h2 id="pick-title" className={styles.pickerTitle}>
          {t("pick.title", { q })}
        </h2>
        <ul>
          {found.map((s) => (
            <li key={s.name}>
              <button type="button" className={styles.pickerRow} onClick={() => askStation(s.name)}>
                <b>{s.name}</b>
                <span>{t("pick.trains", { n: s.trains.length })}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  const near = ta ? didYouMean(ta.stations.map((s) => s.name), q) : [];
  return (
    <div className={styles.none}>
      <p className={styles.noneTitle}>{t("q.noneHelp", { q })}</p>
      {near.length > 0 ? (
        <Suggestions title={t("q.didYouMean")}>
          {near.map((n) => (
            <button key={n} type="button" className={styles.chip} onClick={() => askStation(n)}>
              {n}
            </button>
          ))}
        </Suggestions>
      ) : null}
      <ul className={styles.helpList}>
        {HELP.map((h) => (
          <li key={h.key}>
            <button type="button" className={styles.helpItem} onClick={() => askExample(h.kind, lang === "de" ? h.de : h.en)}>
              <b>{lang === "de" ? h.de : h.en}</b>
              <span>{t(h.key)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Answer({
  outcome,
  u,
  lang,
  span,
  ask,
  ta,
  askStation,
  askExample,
}: {
  outcome: SearchOutcome;
  u: string | null;
  lang: Lang;
  span: string;
  ask: (q: string, u?: string | null) => void;
  ta: TaIndex | null;
  askStation: (name: string) => void;
  askExample: (kind: ExampleKind, text: string) => void;
}) {
  const t = makeT(lang);
  const { parsed, matches } = outcome;
  const min = SEARCH_INDEX.params.searchMinRuns;

  if (outcome.problem === "no-match") {
    return <NoMatch q={parsed.raw} ta={ta} lang={lang} askStation={askStation} askExample={askExample} />;
  }

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
