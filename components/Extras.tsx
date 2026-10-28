import Link from "next/link";
import type { Extras as ExtrasData } from "@/lib/types";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
import { SectionHeader } from "./SectionHeader";
import { fmtDate, fmtDuration, fmtSigned1 } from "./pageFormat";
import styles from "./Extras.module.css";

interface ExtrasProps {
  extras: ExtrasData;
  /** Slugs that have a detail page; other trains render as plain text. */
  pageSlugs: Set<string>;
}

function TrainName({ slug, train, pageSlugs }: { slug: string | null; train: string; pageSlugs: Set<string> }) {
  return slug && pageSlugs.has(slug) ? (
    <Link href={`/train/${slug}/`} className={styles.trainLink}>
      {train}
    </Link>
  ) : (
    <span>{train}</span>
  );
}

function Route({ origin, dest }: { origin: string; dest: string }) {
  return (
    <p className={styles.route}>
      {origin === dest ? `${origin} and back` : `${origin} → ${dest}`}
    </p>
  );
}

export function Extras({ extras, pageSlugs }: ExtrasProps) {
  const { bestBehaved: best, mostCancelled: cancelled, worstTrainMonth: worstMonth, worstRun } = extras;

  return (
    <section id="extras" className="section" aria-labelledby="extras-title">
      <div className="container">
        <SectionHeader eyebrow="Honourable mentions" title="The also-rans" id="extras-title">
          <p>Not every story fits in a top 10.</p>
        </SectionHeader>

        <ul className={styles.grid}>
          {best ? (
            <li className={`${styles.card} ${styles.good}`}>
              <p className={styles.label}>Teacher&rsquo;s pet</p>
              <p className={styles.figure}>
                {fmtSigned1(best.avgMin)}
                <span className={styles.unit}> min</span>
              </p>
              <h3 className={styles.name}>
                <TrainName slug={best.slug} train={best.train} pageSlugs={pageSlugs} />
              </h3>
              <Route origin={best.origin} dest={best.dest} />
              <p className={styles.quip}>
                The best-behaved train in the pool: {fmtSigned1(best.avgMin)} min on average over{" "}
                {fmtInt(best.measured)} measured runs.{" "}
                {best.fullCancelPct >= 10
                  ? `It was also fully cancelled on ${fmt1(best.fullCancelPct)}% of runs, which helps.`
                  : "Pünktlichkeit is a state of mind."}
              </p>
            </li>
          ) : null}

          {cancelled ? (
            <li className={styles.card}>
              <p className={styles.label}>Schrödinger&rsquo;s train</p>
              <p className={styles.figure}>
                {fmt1(cancelled.fullCancelPct)}
                <span className={styles.unit}>%</span>
              </p>
              <h3 className={styles.name}>
                <TrainName slug={cancelled.slug} train={cancelled.train} pageSlugs={pageSlugs} />
              </h3>
              <Route origin={cancelled.origin} dest={cancelled.dest} />
              <p className={styles.quip}>
                The most often fully cancelled train in the pool. Is it running today? Only one way to
                find out. When it did run: {fmtSigned1(cancelled.avgMin)} min late on average.
              </p>
            </li>
          ) : null}

          {worstMonth ? (
            <li className={styles.card}>
              <p className={styles.label}>Worst month at the top</p>
              <p className={styles.figure}>
                {fmt1(worstMonth.avg)}
                <span className={styles.unit}> min</span>
              </p>
              <h3 className={styles.name}>
                <TrainName slug={worstMonth.slug} train={worstMonth.train} pageSlugs={pageSlugs} />
              </h3>
              <p className={styles.route}>{monthLabel(worstMonth.month)}</p>
              <p className={styles.quip}>
                The worst single month for any top-10 train: {fmt1(worstMonth.avg)} min on average
                across {fmtInt(worstMonth.runs)} runs. A month to forget.
              </p>
            </li>
          ) : null}

          {worstRun ? (
            <li className={`${styles.card} ${styles.accent}`}>
              <p className={styles.label}>The single worst run</p>
              <p className={styles.figure}>
                {fmtDuration(worstRun.delayMin)}
              </p>
              <h3 className={styles.name}>
                <TrainName slug={worstRun.slug} train={worstRun.train} pageSlugs={pageSlugs} />
              </h3>
              <Route origin={worstRun.origin} dest={worstRun.dest} />
              <p className={styles.quip}>
                On {fmtDate(worstRun.date)} it arrived {fmtInt(worstRun.delayMin)} minutes late.{" "}
                {worstRun.delayMin >= 450 ? "That is a full working day." : "Long enough to rethink some life choices."}{" "}
                Hope someone packed sandwiches.
              </p>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
