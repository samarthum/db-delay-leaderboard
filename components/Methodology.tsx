import type { Stats } from "@/lib/types";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
import { getMonthly, getStations } from "@/lib/data";
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

/** Two ranked lines that share a name, if any: the clearest example of why a line is more than its number. */
function sameNameLines(stats: Stats) {
  const lines = [...stats.rankings.regional.minutes, ...stats.rankings.regional.percent];
  for (const a of lines) {
    const b = lines.find((x) => x.name === a.name && x.slug !== a.slug);
    if (b) return [a, b] as const;
  }
  return null;
}

export function Methodology({ stats }: { stats: Stats }) {
  const { params: p, overall, window: w, headline } = stats;
  const ld = overall.longDistance;
  const reg = overall.regional;
  const series = getMonthly().series;
  const nudges = [...series.longDistance, ...series.regional].map((m) => m.avgDelayMin - m.avgDelayMinUnclamped);
  const nudgeLo = Math.min(...nudges).toFixed(1);
  const nudgeHi = Math.max(...nudges).toFixed(1);
  const merged = [...stats.rankings.longDistance.minutes, ...stats.rankings.longDistance.percent].find(
    (t) => t.alsoRunsAs.length > 0,
  );
  const twins = sameNameLines(stats);
  const stations = getStations().stations;
  const recent = headline.months;
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
              <a href={DATA_SOURCE_URL}>piebro/deutsche-bahn-data</a>. We count long-distance trains (
              {p.longDistanceTypes.join(", ")}) and regional trains on {p.regionalLinePrefixes.join(", ")} lines. That
              is {fmtInt(ld.runs)} long-distance trips and {fmtInt(reg.runs)} regional trips.
            </p>
          </Item>

          <Item q="Where does the big number come from?">
            <p>
              It is the average delay of every long-distance trip in the last {recent.length} months of data,{" "}
              {monthLabel(recent[0])} to {monthLabel(recent[recent.length - 1])}. That is{" "}
              {fmtInt(headline.categories.longDistance.measured)} trips. Early arrivals count as negative delay. The
              regional number is worked out the same way, from {fmtInt(headline.categories.regional.measured)} trips.
            </p>
          </Item>

          <Item q="How is delay measured?">
            <p>
              We compare the planned and the actual arrival at the train&rsquo;s last stop. For long-distance trains
              that leave Germany, that is the last stop in Germany.
            </p>
            <p>
              Trips that arrived {early} or more than {fmtInt(p.clampMaxMinutes)} min late look like data errors, so we
              leave them out. That is {fmtInt(ld.droppedByClamp + reg.droppedByClamp)} trips. It changes the monthly
              averages by {nudgeLo} to {nudgeHi} min.
            </p>
          </Item>

          <Item q="What does % of trip mean?">
            <p>
              The delay divided by the planned trip time. 20 min late on a 2 hour trip is +17%. Trips planned for less
              than {p.minScheduledMinutesForPct} min don&rsquo;t count for %, so very short hops can&rsquo;t give silly
              numbers.
            </p>
          </Item>

          <Item q="Which trains and lines are on the list?">
            <p>
              Long-distance trains are listed by train number. Each needs at least {p.minRunsForPool} measured trips.
              That is {fmtInt(ld.poolSize)} of {fmtInt(ld.units)} train numbers.
            </p>
            <p>
              Regional trains are listed by line, like RE 19, because that is the name on the platform. A line counts
              every trip in both directions and needs at least {fmtInt(p.minRunsForLinePool)} measured trips. That is{" "}
              {fmtInt(reg.poolSize)} of {fmtInt(reg.units)} lines. Some regions reuse the same line number, so a line is
              its number plus the stations it serves
              {twins
                ? ` (${twins[0].name} ${twins[0].origin} to ${twins[0].dest} and ${twins[1].name} ${twins[1].origin} to ${twins[1].dest} are two lines)`
                : ""}
              .
            </p>
            <p>
              For the % lists, the same number of trips must count for %. Ties are sorted by name. Some long-distance
              trains run under several numbers with the same route and times
              {merged ? ` (${merged.name} also runs as ${merged.alsoRunsAs.join(", ")})` : ""}. We count them once,
              under the shortest number.
            </p>
          </Item>

          <Item q="Why no night trains or S-Bahn?">
            <p>
              Night trains ({p.nightTrainTypes.join(", ")}) are left out, so the list compares day trains with day
              trains. S-Bahn trains are frequent city services, and they are left out too. So are buses and
              replacement trains.
            </p>
          </Item>

          <Item q="What about cancelled trains?">
            <p>
              A trip is cancelled when every stop on it was cancelled. It has no delay, so it only counts in the
              cancelled share: {fmt1(ld.fullCancelPct)}% of long-distance trips and {fmt1(reg.fullCancelPct)}% of
              regional trips. Train and line pages also show trips that were partly cancelled, where at least one stop
              was dropped.
            </p>
          </Item>

          <Item q={`Why ${w.monthCount} months?`}>
            <p>
              We take the last 12 monthly files and skip any month with fewer than{" "}
              {fmtInt(p.minStationsForFullMonth)} stations in the data. That leaves {monthLabel(w.firstMonth)} to{" "}
              {monthLabel(w.lastMonth)}.
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
              Each dot is a station with at least {fmtInt(p.minStationArrivals)} measured arrivals of long-distance and
              regional trains, {fmtInt(stations.length)} stations in all. The colour is the average delay on arrival,
              {" "}
              {monthLabel(w.firstMonth)} to {monthLabel(w.lastMonth)}. The list under the map shows big stations, with
              at least {fmtInt(p.bigStationMinArrivals)} arrivals.
            </p>
          </Item>

          <Item q="What can't it tell you?">
            <p>
              Why a train is late. Delays are as DB reports them, and gaps in DB&rsquo;s data are gaps here. Stops
              outside Germany are mostly not covered. A train or line can take different routes on different days, and
              we show its most common one.
            </p>
          </Item>
        </div>
      </div>
    </section>
  );
}
