"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SEARCH_INDEX, loadLine } from "@/lib/searchClient";
import {
  WEEKDAYS,
  WEEKDAYS_SHORT,
  lineKey,
  unitName,
  weekdayExtremes,
  type SearchUnit,
} from "@/lib/searchCore";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
import { absoluteUrl, unitHref } from "@/lib/site";
import { renderResultCard } from "@/lib/shareImage";
import { fmtDate, fmtDuration } from "./pageFormat";
import { ShareButton } from "./ShareButton";
import styles from "./SearchResult.module.css";

export function kindLabel(u: SearchUnit): string {
  return u.kind === 0 ? "Long-distance train" : u.kind === 1 ? "Regional line" : "Regional train";
}

export function routeText(u: SearchUnit): string {
  return `${u.origin} ${u.kind === 1 ? "↔" : "→"} ${u.dest}`;
}

function lateText(avg: number): string {
  return avg < 0 ? `${fmt1(-avg)} min early` : `${fmt1(avg)} min late`;
}

function shareUrl(u: SearchUnit): string {
  if (u.slug) return absoluteUrl(unitHref({ category: u.kind === 0 ? "longDistance" : "regional", slug: u.slug }));
  const p = new URLSearchParams({ q: unitName(u) });
  if (u.kind !== 0) p.set("u", u.key);
  return absoluteUrl(`/?${p.toString()}`);
}

function Weekdays({ unit }: { unit: SearchUnit }) {
  const { searchMinWeekdayRuns } = SEARCH_INDEX.params;
  const values = unit.weekday;
  const ext = weekdayExtremes(values);
  const top = Math.max(1, ...values.map((v) => v ?? 0));
  const described = values
    .map((v, i) => `${WEEKDAYS[i]} ${v === null ? "not enough trips" : lateText(v)}`)
    .join(", ");
  return (
    <section className={styles.days} aria-labelledby="days-title">
      <h4 id="days-title" className={styles.h}>
        Which days are worst
      </h4>
      <p className={styles.text}>
        {ext
          ? `${WEEKDAYS[ext.worst]}s are the worst, at ${lateText(values[ext.worst] as number)} on average. ${WEEKDAYS[ext.best]}s are the best, at ${lateText(values[ext.best] as number)}.`
          : "There are too few trips on separate days to compare them."}
      </p>
      <div className={styles.bars} role="img" aria-label={`Average delay by weekday: ${described}`}>
        {values.map((v, i) => (
          <div key={WEEKDAYS_SHORT[i]} className={styles.day} aria-hidden="true">
            <span className={styles.dayValue}>{v === null ? "–" : fmt1(v)}</span>
            <span className={styles.dayTrack}>
              <span
                className={`${styles.dayBar} ${ext && ext.worst === i ? styles.dayWorst : ""}`}
                style={{ height: v === null ? 0 : `${Math.max(4, Math.round((Math.max(v, 0) / top) * 100))}%` }}
              />
            </span>
            <span className={styles.dayName}>{WEEKDAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>
      <p className={styles.fine}>Minutes late on average. Days with fewer than {searchMinWeekdayRuns} measured trips are left blank.</p>
    </section>
  );
}

export function SearchResult({
  unit,
  onOpenLine,
}: {
  unit: SearchUnit;
  onOpenLine: (q: string, key: string) => void;
}) {
  const { window: win, params } = SEARCH_INDEX;
  const span = `${monthLabel(win.firstMonth)} to ${monthLabel(win.lastMonth)}`;
  const name = unitName(unit);
  const few = unit.measured < params.searchFewRuns;
  const [line, setLine] = useState<SearchUnit | null>(null);
  const [imageStatus, setImageStatus] = useState("");

  useEffect(() => {
    let current = true;
    setLine(null);
    loadLine(unit).then((l) => current && setLine(l), () => undefined);
    return () => {
      current = false;
    };
  }, [unit]);

  const shareText =
    `${name} ${routeText(unit)}: ${lateText(unit.avg)} on average, ` +
    `${fmt1(unit.late)}% of trips ${params.lateMinutes} minutes or more late, ${fmt1(unit.cancelled)}% cancelled. ${span}.`;

  async function saveImage() {
    setImageStatus("Making the image…");
    try {
      const blob = await renderResultCard(unit, { kind: kindLabel(unit), span });
      const file = new File([blob], `${unit.key}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: shareText, url: shareUrl(unit) });
          setImageStatus("");
          return;
        } catch (err) {
          if ((err as DOMException).name === "AbortError") {
            setImageStatus("");
            return;
          }
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${unit.key}-delays.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setImageStatus("Saved. Attach it to your post.");
    } catch {
      setImageStatus("Could not make the image in this browser.");
    }
  }

  return (
    <article className={styles.card} aria-labelledby="result-name">
      <p className={styles.kicker}>
        <span className={styles.chip}>{kindLabel(unit)}</span>
      </p>
      <h3 id="result-name" className={styles.name}>
        {name}
      </h3>
      <p className={styles.route}>{routeText(unit)}</p>
      {unit.kind === 2 && unit.line ? (
        <p className={styles.lineNote}>
          Runs on the line{" "}
          {unit.lineHash ? (
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                const [type, num] = (unit.line as string).split(" ");
                onOpenLine(unit.line as string, lineKey(type, num, unit.lineHash as string));
              }}
            >
              {unit.line}
            </button>
          ) : (
            unit.line
          )}
          {line ? `, ${routeText(line)}` : ""}.
        </p>
      ) : null}

      <p className={styles.figure}>
        <span className={styles.big}>{fmt1(Math.abs(unit.avg))}</span>
        <span className={styles.bigLabel}>{unit.avg < 0 ? "min early" : "min late"} on average</span>
      </p>
      <p className={styles.basis}>
        Delay at the last stop, {span}. Based on {fmtInt(unit.measured)} trips.
      </p>

      {few ? (
        <p className={styles.warning}>
          Only {fmtInt(unit.measured)} trips were measured, so these numbers can swing a lot. The list only has trains with
          at least {params.searchMinRuns} measured trips; below {params.searchFewRuns} treat the numbers as rough.
        </p>
      ) : null}

      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt>{params.lateMinutes}+ min late</dt>
          <dd>{fmt1(unit.late)}%</dd>
          <dd className={styles.tileNote}>of trips</dd>
        </div>
        <div className={styles.tile}>
          <dt>Cancelled</dt>
          <dd>{fmt1(unit.cancelled)}%</dd>
          <dd className={styles.tileNote}>of {fmtInt(unit.runs)} scheduled</dd>
        </div>
        <div className={styles.tile}>
          <dt>Worst trip</dt>
          <dd>{fmtDuration(unit.worst.delay)}</dd>
          <dd className={styles.tileNote}>{fmtDate(unit.worst.date)}</dd>
        </div>
      </dl>
      {unit.worst.origin && unit.worst.dest ? (
        <p className={styles.fine}>
          The worst trip ran {unit.worst.origin} → {unit.worst.dest}.
        </p>
      ) : null}

      <Weekdays unit={unit} />

      <div className={styles.actions}>
        <ShareButton title={`${name} · German Punctuality`} text={shareText} url={shareUrl(unit)} label="Share this result">
          <button type="button" className={styles.imageButton} onClick={saveImage}>
            Save as image
          </button>
        </ShareButton>
        {imageStatus ? (
          <p className={styles.status} role="status">
            {imageStatus}
          </p>
        ) : null}
        {unit.slug ? (
          <Link
            className={styles.full}
            href={unitHref({ category: unit.kind === 0 ? "longDistance" : "regional", slug: unit.slug })}
          >
            See the full page for {unit.kind === 0 ? "this train" : "this line"} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </article>
  );
}
