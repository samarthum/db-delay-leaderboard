"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SEARCH_INDEX, pickByKey, runSearch, type SearchOutcome } from "@/lib/searchClient";
import { unitName, type SearchUnit } from "@/lib/searchCore";
import { fmt1, monthLabel } from "@/lib/format";
import { SearchResult, kindLabel, routeText } from "./SearchResult";
import styles from "./TrainSearch.module.css";

const EXAMPLES = ["ICE 1541", "RE 19", "RB 31"];
const TYPING_DELAY_MS = 250;

interface Applied {
  q: string;
  u: string | null;
}

function readUrl(): Applied {
  const p = new URLSearchParams(window.location.search);
  return { q: (p.get("q") ?? "").trim(), u: p.get("u") };
}

function urlFor(a: Applied): string {
  const p = new URLSearchParams();
  if (a.q) p.set("q", a.q);
  if (a.q && a.u) p.set("u", a.u);
  const s = p.toString();
  return `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
}

export function TrainSearch() {
  const [text, setText] = useState("");
  const [applied, setApplied] = useState<Applied>({ q: "", u: null });
  const [answer, setAnswer] = useState<{ q: string; outcome: SearchOutcome } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
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
      setText(url.q);
      setApplied(url);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    if (!applied.q) {
      setAnswer(null);
      setFailed(null);
      return;
    }
    let current = true;
    setFailed(null);
    runSearch(applied.q).then(
      (outcome) => current && setAnswer({ q: applied.q, outcome }),
      (err) => current && setFailed(String(err?.message ?? err)),
    );
    return () => {
      current = false;
    };
  }, [applied.q]);

  function onType(value: string) {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit({ q: value.trim(), u: null }, "replace"), TYPING_DELAY_MS);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    window.clearTimeout(timer.current);
    commit({ q: text.trim(), u: null }, "push");
    input.current?.blur();
  }

  function ask(q: string, u: string | null = null) {
    window.clearTimeout(timer.current);
    setText(q);
    commit({ q, u }, "push");
  }

  const ready = answer !== null && answer.q === applied.q ? answer.outcome : null;
  const span = `${monthLabel(SEARCH_INDEX.window.firstMonth)} to ${monthLabel(SEARCH_INDEX.window.lastMonth)}`;

  return (
    <section className={styles.search} aria-labelledby="search-title">
      <div className="container">
        <p className={styles.kicker}>Train lookup</p>
        <p id="search-title" className={styles.title}>
          Look up your train
        </p>
        <p className={styles.sub}>
          Type the number of the train you are taking, like ICE 1541, or a regional line like RE 19. You get its record
          for {span} ({SEARCH_INDEX.window.monthCount} months).
        </p>
        <form className={styles.form} role="search" onSubmit={submit}>
          <label htmlFor="train-q" className="visually-hidden">
            Train number or line
          </label>
          <input
            ref={input}
            id="train-q"
            className={styles.input}
            type="search"
            name="q"
            value={text}
            onChange={(e) => onType(e.target.value)}
            placeholder="ICE 1541, RE 19, RB 31"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="search"
          />
          <button type="submit" className={styles.go}>
            Look up
          </button>
        </form>
        <p className={styles.try}>
          Try{" "}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              {i > 0 ? (i === EXAMPLES.length - 1 ? " or " : ", ") : ""}
              <button type="button" className={styles.example} onClick={() => ask(ex)}>
                {ex}
              </button>
            </span>
          ))}
          .
        </p>

        <div className={styles.results} aria-live="polite">
          {failed ? (
            <p className={styles.message}>
              The search data did not load. Check your connection and try again.
            </p>
          ) : applied.q && !ready ? (
            <p className={styles.loading}>Looking up {applied.q}&hellip;</p>
          ) : ready ? (
            <Answer outcome={ready} u={applied.u} span={span} ask={ask} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function UnitButton({ u, selected, onPick }: { u: SearchUnit; selected?: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`${styles.option} ${selected ? styles.optionOn : ""}`} onClick={onPick} aria-pressed={selected}>
      <span className={styles.optionMain}>
        <span className={styles.optionName}>{unitName(u)}</span>
        <span className={styles.optionKind}>{kindLabel(u)}</span>
      </span>
      <span className={styles.optionRoute}>{routeText(u)}</span>
      <span className={styles.optionStat}>{avgText(u)}</span>
    </button>
  );
}

function avgText(u: SearchUnit): string {
  return u.avg < 0 ? `${fmt1(-u.avg)} min early` : `${fmt1(u.avg)} min late`;
}

/** A long-distance train is fully named by its type and number; a line or regional train is not. */
function keyFor(u: SearchUnit): string | null {
  return u.kind === 0 ? null : u.key;
}

function Answer({
  outcome,
  u,
  span,
  ask,
}: {
  outcome: SearchOutcome;
  u: string | null;
  span: string;
  ask: (q: string, u?: string | null) => void;
}) {
  const { parsed, matches } = outcome;
  const min = SEARCH_INDEX.params.searchMinRuns;

  if (outcome.problem === "need-number") {
    return <p className={styles.message}>Add the train number after {parsed.type}, for example {parsed.type} 1541.</p>;
  }
  if (outcome.problem === "unsupported") {
    return (
      <p className={styles.message}>
        {outcome.unsupported} are not covered. This site has long-distance trains (ICE, IC, EC and others) and regional lines
        and trains (RE, RB, IRE, MEX, RS, FEX).
      </p>
    );
  }

  if (matches.length > 0) {
    const selected = matches.length === 1 ? matches[0] : pickByKey(matches, u);
    const note = outcome.typeNote;
    return (
      <>
        {note ? (
          <p className={styles.note}>
            {note.used.length > 0
              ? `There is no train type “${note.typed}”. Showing ${note.used.join(" and ")} ${parsed.num}.`
              : `There is no train type “${note.typed}”. Showing everything numbered ${parsed.num}.`}
          </p>
        ) : null}
        {matches.length > 1 ? (
          <div className={styles.choose}>
            <p className={styles.chooseTitle}>
              {matches.length} match {parsed.type ? `${parsed.type} ${parsed.num}` : parsed.num}. {selected ? "Showing one." : "Pick the one you mean."}
            </p>
            <ul className={styles.options}>
              {matches.slice(0, 12).map((m) => (
                <li key={m.key}>
                  <UnitButton u={m} selected={selected?.key === m.key} onPick={() => ask(parsed.raw, m.key)} />
                </li>
              ))}
            </ul>
            {matches.length > 12 ? <p className={styles.more}>And {matches.length - 12} more. Add the train type to narrow it down.</p> : null}
          </div>
        ) : null}
        {selected ? <SearchResult unit={selected} onOpenLine={(q, key) => ask(q, key)} /> : null}
      </>
    );
  }

  return (
    <div className={styles.none}>
      <p className={styles.noneTitle}>Nothing found for &ldquo;{parsed.raw}&rdquo;.</p>
      {parsed.num === null ? (
        <p className={styles.message}>Search by train number, like ICE 1541, RE 19 or just 1541.</p>
      ) : (
        <p className={styles.message}>
          The list has long-distance trains, regional lines and regional trains with at least {min} measured trips between{" "}
          {span}. Night trains, S-Bahn and buses are left out.
        </p>
      )}
      {outcome.typos.length > 0 ? (
        <Suggestions title="Did you mean">
          {outcome.typos.map((s) => (
            <button key={`${s.type} ${s.num}`} type="button" className={styles.chip} onClick={() => ask(`${s.type} ${s.num}`)}>
              {s.type} {s.num}
            </button>
          ))}
        </Suggestions>
      ) : null}
      {outcome.sameNumber.length > 0 ? (
        <Suggestions title={`Trains numbered ${parsed.num}`}>
          {outcome.sameNumber.map((s) => (
            <button key={s.key} type="button" className={styles.chip} onClick={() => ask(unitName(s), keyFor(s))}>
              {unitName(s)}
            </button>
          ))}
        </Suggestions>
      ) : null}
      {outcome.prefix.length > 0 ? (
        <Suggestions title={`Numbers starting with ${parsed.num}`}>
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
