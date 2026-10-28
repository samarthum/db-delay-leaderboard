import type { Stats } from "@/lib/types";
import { fmtInt, monthLabel, windowLabel } from "@/lib/format";
import { DATA_SOURCE_URL } from "@/lib/site";
import { SectionHeader } from "./SectionHeader";
import { fmtDate } from "./pageFormat";
import styles from "./Methodology.module.css";

function Item({ q, children, open }: { q: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className={styles.item} open={open}>
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
  const types = p.trainTypes.join(", ");

  return (
    <section id="methodology" className="section" aria-labelledby="methodology-title">
      <div className="container">
        <SectionHeader eyebrow="Methodology & FAQ" title="The small print" id="methodology-title">
          <p>How the numbers are made, and what they can&rsquo;t tell you.</p>
        </SectionHeader>

        <div className={styles.list}>
          <Item q="What counts as a run?" open>
            <p>
              One train number on one scheduled day, for example ICE 1541 leaving Köln on a given
              morning. We count long-distance trains ({types}) and skip replacement trains. The
              window holds {fmtInt(o.runs)} runs from {fmtInt(o.trains)} distinct trains.
            </p>
          </Item>

          <Item q="Where is the delay measured?">
            <p>
              At the last non-cancelled stop with a scheduled arrival: scheduled arrival vs actual
              arrival, in minutes. For international trains that is the last German stop, so a
              Nightjet to Amsterdam is judged at its last German stop, not in Amsterdam. Routes on this
              site still name the train&rsquo;s real destination.
            </p>
          </Item>

          <Item q="What about absurd values?">
            <p>
              Runs with a final delay below {p.clampMinMinutes} min or above {fmtInt(p.clampMaxMinutes)}{" "}
              min are dropped from the delay statistics. That removed {fmtInt(o.droppedByClamp)} runs,
              which look more like data errors than real journeys. {fmtInt(o.measuredRuns)} runs remain
              measured.
            </p>
          </Item>

          <Item q="What does “% of the journey” mean?">
            <p>
              Delay divided by the scheduled journey time: from the run&rsquo;s first scheduled
              departure to its scheduled arrival at the same stop where the delay is measured. 20 min
              late on a 2-hour trip is +17%. Runs scheduled for less than {p.minScheduledMinutesForPct}{" "}
              minutes are left out of the % statistics only, so tiny hops can&rsquo;t produce silly
              percentages.
            </p>
          </Item>

          <Item q="Which trains get ranked?">
            <p>
              Only trains with at least {p.minRunsForPool} measured runs:{" "}
              {fmtInt(o.poolSize)} of {fmtInt(o.trains)} trains. The % ranking additionally needs{" "}
              {p.minRunsForPool} runs that count for the % statistics. Each ranking shows its own top{" "}
              {p.topN} (and ranks up to {p.moreN} behind the expander). Ties are broken alphabetically.
            </p>
          </Item>

          <Item q="Full vs partial cancellation?">
            <p>
              A run is fully cancelled when every one of its stops was cancelled, and partially
              cancelled when at least one stop was. Fully cancelled runs have no delay to measure, so
              they appear only in the cancellation rates ({o.fullCancelPct}% of all runs in the
              window).
            </p>
          </Item>

          <Item q={`Why ${w.monthCount} months and not 12?`}>
            <p>
              The site uses the latest 12 published monthly files and keeps only months with full
              station coverage (at least {fmtInt(p.minStationsForFullMonth)} stations). That gives{" "}
              {windowLabel(w)}.
            </p>
            {w.skipped.length > 0 ? (
              <ul className={styles.bullets}>
                {w.skipped.map((s) => (
                  <li key={s.month}>
                    {monthLabel(s.month)} is skipped: only {fmtInt(s.stations)} stations are covered.
                  </li>
                ))}
              </ul>
            ) : null}
          </Item>

          <Item q="How fresh is this?">
            <p>
              A GitHub Actions workflow checks for a new monthly file every week and recomputes
              everything when the window changes. Last update: {fmtDate(stats.generatedAt)}.
            </p>
          </Item>

          <Item q="How does the station map work?">
            <p>
              Each dot is a station with at least {fmtInt(p.minStationArrivals)} measured long-distance
              arrivals in the window ({fmtInt(stats.stations.length)} stations). Colour shows the
              average arrival delay; the share of arrivals {p.lateThresholdMinutes}+ min late is in the
              popup. Lines are the top trains&rsquo; most common stop sequences.
            </p>
          </Item>

          <Item q="Caveats">
            <ul className={styles.bullets}>
              <li>
                The data is DB&rsquo;s real-time feed as collected by{" "}
                <a href={DATA_SOURCE_URL}>piebro/deutsche-bahn-data</a>. Gaps in the feed are gaps
                here.
              </li>
              <li>
                Real-time data has limits: delays are as reported by DB, and stops outside Germany
                are not covered.
              </li>
              <li>
                A train number can run different routes on different days. Each train shows how many
                route variants it had; the usual route is the most common one.
              </li>
              <li>
                This shows where delays happen, not why. Correlation, causation, you know the drill.
              </li>
            </ul>
          </Item>
        </div>
      </div>
    </section>
  );
}
