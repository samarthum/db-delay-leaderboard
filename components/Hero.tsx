import Link from "next/link";
import type { Stats } from "@/lib/types";
import { fmt1, fmtInt, fmtMin, fmtPct, windowLabel } from "@/lib/format";
import { SplitFlap } from "./SplitFlap";
import styles from "./Hero.module.css";

export function Hero({ stats }: { stats: Stats }) {
  const { overall, params, window } = stats;
  const top = stats.rankings.minutes[0];
  const topPct = stats.rankings.percent[0];

  return (
    <header className={styles.hero}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.intro}>
          <p className={`eyebrow ${styles.window}`}>{windowLabel(window)}</p>
          <h1 className={styles.title}>
            Deutsche Bahn&rsquo;s <span className={styles.accent}>most delayed</span> trains
          </h1>
          <p className={styles.lede}>
            We checked {fmtInt(overall.measuredRuns)} long-distance runs and ranked every train
            that ran at least {params.minRunsForPool} times. Bring a snack. Your connection is not
            guaranteed.
          </p>
        </div>

        <section className={`board ${styles.board}`} aria-labelledby="hero-top-train">
          <div className={styles.boardHead}>
            <span className={styles.platform}>№ 1</span>
            <span className={styles.boardLabel}>Most minutes late</span>
          </div>

          <div className={styles.figure}>
            <SplitFlap
              text={fmtMin(top.minutes.avg)}
              size="xl"
              tone="accent"
              label={`${fmt1(top.minutes.avg)} minutes`}
            />
            <p className={styles.figureUnit}>
              <span className={styles.unitBig}>min</span>
              <span>late on average</span>
            </p>
          </div>

          <h2 id="hero-top-train" className={styles.trainName}>
            {top.train}
          </h2>
          <p className={styles.route}>
            {top.origin} <span aria-hidden="true">→</span>
            <span className="visually-hidden">to</span> {top.dest}
            <sup className={styles.fn}>*</sup>
          </p>
          <p className={styles.relative}>
            <strong>{fmtPct(top.percent.avg)}</strong> of the scheduled journey ·{" "}
            {fmt1(top.minutes.avg)} min exactly · {fmtInt(top.measured)} measured runs
          </p>

          <Link href={`/train/${top.slug}/`} className={styles.trainLink}>
            See the full record <span aria-hidden="true">→</span>
          </Link>

          {topPct && topPct.slug !== top.slug ? (
            <p className={styles.runnerUp}>
              Relative to journey length, the crown goes to{" "}
              <Link href={`/train/${topPct.slug}/`}>{topPct.train}</Link>: {fmtPct(topPct.percent.avg)}{" "}
              of the journey on {topPct.origin} → {topPct.dest}.
            </p>
          ) : null}

          <p className={styles.footnote}>
            * International trains are measured at their last German stop.
          </p>
        </section>

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Trains ranked</dt>
            <dd className={styles.statValue}>{fmtInt(overall.poolSize)}</dd>
            <dd className={styles.statNote}>with ≥ {params.minRunsForPool} measured runs</dd>
          </div>
          <div className={styles.stat}>
            <dt>Runs measured</dt>
            <dd className={styles.statValue}>{fmtInt(overall.measuredRuns)}</dd>
            <dd className={styles.statNote}>of {fmtInt(overall.runs)} long-distance runs</dd>
          </div>
          <div className={styles.stat}>
            <dt>Average delay</dt>
            <dd className={styles.statValue}>{fmt1(overall.avgDelayMin)} min</dd>
            <dd className={styles.statNote}>at the last German stop</dd>
          </div>
          <div className={styles.stat}>
            <dt>Fully cancelled</dt>
            <dd className={styles.statValue}>{fmt1(overall.fullCancelPct)}%</dd>
            <dd className={styles.statNote}>of all runs. Can&rsquo;t be late if you never leave.</dd>
          </div>
        </dl>

        <a href="#leaderboard" className={styles.cta}>
          See the leaderboard <span aria-hidden="true">↓</span>
        </a>
      </div>
    </header>
  );
}
