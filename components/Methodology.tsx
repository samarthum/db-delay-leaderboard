import type { Stats } from "@/lib/types";
import { fmtInt, monthLabel } from "@/lib/format";
import { getMonthly } from "@/lib/data";
import { DATA_SOURCE_URL } from "@/lib/site";
import { SectionHeader } from "./SectionHeader";
import styles from "./Methodology.module.css";

function Item({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className={styles.item}>
      <summary className={styles.summary}>
        <span>{q}</span>
        <span className={styles.icon} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

export function Methodology({ stats }: { stats: Stats }) {
  const { params: p, overall: o, window: w } = stats;
  const nudges = getMonthly().months.map((m) => m.avgDelayMin - m.avgDelayMinUnclamped);
  const merged = [...stats.rankings.percent, ...stats.rankings.minutes].find((t) => t.alsoRunsAs.length > 0);
  const nudgeLo = Math.min(...nudges).toFixed(1);
  const nudgeHi = Math.max(...nudges).toFixed(1);
  const early =
    p.clampMinMinutes < 0 ? `more than ${-p.clampMinMinutes} min early` : `less than ${p.clampMinMinutes} min late`;

  return (
    <section id="methodology" className="section" aria-labelledby="methodology-title">
      <div className="container">
        <SectionHeader title="How this works" id="methodology-title" />

        <div className={styles.list}>
          <Item q="Where does the data come from?">
            <p>
              From Deutsche Bahn&rsquo;s live train data, collected by{" "}
              <a href={DATA_SOURCE_URL}>piebro/deutsche-bahn-data</a>. We use long-distance trains only (
              {p.trainTypes.join(", ")}), not replacement trains. That is {fmtInt(o.runs)} trips by{" "}
              {fmtInt(o.trains)} trains.
            </p>
          </Item>

          <Item q="How is delay measured?">
            <p>
              We compare the planned and the actual arrival at the train&rsquo;s last stop. For trains
              that leave Germany, that is the last stop in Germany.
            </p>
            <p>
              Trips that arrived {early} or more than {fmtInt(p.clampMaxMinutes)} min late look like
              data errors, so we leave them out. That is {fmtInt(o.droppedByClamp)} trips, and leaves{" "}
              {fmtInt(o.measuredRuns)}. It makes the monthly averages {nudgeLo} to {nudgeHi} min higher
              than with them in.
            </p>
          </Item>

          <Item q="What does % of trip mean?">
            <p>
              The delay divided by the planned trip time. 20 min late on a 2 hour trip is +17%. Trips
              planned for less than {p.minScheduledMinutesForPct} min don&rsquo;t count for %, so very
              short hops can&rsquo;t give silly numbers.
            </p>
          </Item>

          <Item q="Which trains are on the list?">
            <p>
              Trains with at least {p.minRunsForPool} measured trips. That is {fmtInt(o.poolSize)} of{" "}
              {fmtInt(o.trains)} train numbers. For the % list, {p.minRunsForPool} of those trips must
              count for %. Ties are sorted by name.
            </p>
            <p>
              Some trains run under several numbers with the same route and times
              {merged ? ` (${merged.train} also runs as ${merged.alsoRunsAs.join(", ")})` : ""}. We
              count them once, under the shortest number.
            </p>
          </Item>

          <Item q="What about cancelled trains?">
            <p>
              A trip is cancelled when every stop on it was cancelled. It has no delay, so it only counts
              in the cancelled share: {o.fullCancelPct}% of all trips. Train pages also show trips that
              were partly cancelled, where at least one stop was dropped.
            </p>
          </Item>

          <Item q={`Why ${w.monthCount} months?`}>
            <p>
              We take the last 12 monthly files and skip any month with fewer than{" "}
              {fmtInt(p.minStationsForFullMonth)} stations in the data. That leaves{" "}
              {monthLabel(w.firstMonth)} to {monthLabel(w.lastMonth)}.
            </p>
            {w.skipped.length > 0 ? (
              <ul className={styles.bullets}>
                {w.skipped.map((s) => (
                  <li key={s.month}>
                    {monthLabel(s.month)} is skipped. It has only {fmtInt(s.stations)} stations.
                  </li>
                ))}
              </ul>
            ) : null}
          </Item>

          <Item q="What does the map show?">
            <p>
              Each dot is a station with at least {fmtInt(p.minStationArrivals)} arrivals in the data (
              {fmtInt(stats.stations.length)} stations). Bigger dots have more arrivals. The colour is the
              average delay. Lines are the usual routes of the top 10 trains. Tap a dot or a line for
              details.
            </p>
          </Item>

          <Item q="What can't it tell you?">
            <p>
              Why a train is late. Delays are as DB reports them, and gaps in DB&rsquo;s data are gaps
              here. Stops outside Germany are not covered. A train can take different routes on
              different days, and we show its most common one.
            </p>
          </Item>
        </div>
      </div>
    </section>
  );
}
