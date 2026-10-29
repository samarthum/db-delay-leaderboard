import Link from "next/link";
import type { Stats } from "@/lib/types";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
import { absoluteUrl, ogImagePath } from "@/lib/site";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { ShareButton } from "./ShareButton";
import styles from "./RecapPage.module.css";

export function RecapPage({ stats }: { stats: Stats }) {
  const { recap, window: w } = stats;
  const ld = recap.longDistance;
  const reg = recap.regional;
  const span = `${monthLabel(w.firstMonth)} to ${monthLabel(w.lastMonth)}`;
  const wide = ogImagePath(w.lastMonth, "recap");
  const tall = ogImagePath(w.lastMonth, "recap-tall");
  const facts: { value: string; unit?: string; label: string }[] = [
    { value: fmt1(ld.avgDelayMin), unit: "min", label: "late on average at the last stop" },
    { value: `${fmt1(ld.latePct)}%`, label: "arrive 15 minutes or more late" },
    { value: `${fmt1(ld.late60Pct)}%`, label: "arrive an hour or more late" },
    { value: `${fmt1(ld.cancelledPct)}%`, label: "of scheduled trains are cancelled" },
  ];
  const shareText =
    `Long-distance trains in Germany, ${span}: ${fmt1(ld.avgDelayMin)} min late on average, ` +
    `${fmt1(ld.latePct)}% 15 minutes or more late, ${fmt1(ld.cancelledPct)}% cancelled.`;

  return (
    <>
      <TopBar />
      <main className={`container ${styles.page}`}>
        <p className={styles.kicker}>
          Recap · {span} ({w.monthCount} months)
        </p>
        <h1 className={styles.title}>Long-distance trains in Germany</h1>
        <p className={styles.lede}>
          ICE, IC, EC and the other long-distance trains. {fmtInt(ld.measured)} trips with a measured arrival, out of{" "}
          {fmtInt(ld.runs)} scheduled.
        </p>

        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt className={styles.label}>{f.label}</dt>
              <dd className={styles.value}>
                {f.value}
                {f.unit ? <span className={styles.unit}> {f.unit}</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        <p className={styles.regional}>
          Regional trains over the same months: {fmt1(reg.avgDelayMin)} min late on average, {fmt1(reg.latePct)}% 15
          minutes or more late, {fmt1(reg.cancelledPct)}% cancelled.
        </p>

        <div className={styles.share}>
          <ShareButton title={`German Punctuality: ${span}`} text={shareText} url={absoluteUrl("/recap/")} label="Share the recap" />
        </div>

        <h2 className={styles.h}>Pictures to post</h2>
        <div className={styles.pictures}>
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wide} width={1200} height={630} alt={`Recap card for ${span}`} className={styles.imgWide} />
            <figcaption>
              <a href={wide} download="german-punctuality-recap.png">
                Download wide (1200 × 630)
              </a>
            </figcaption>
          </figure>
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tall} width={1080} height={1920} alt={`Tall recap card for ${span}`} className={styles.imgTall} />
            <figcaption>
              <a href={tall} download="german-punctuality-recap-tall.png">
                Download tall (1080 × 1920)
              </a>
            </figcaption>
          </figure>
        </div>

        <h2 className={styles.h}>How this is counted</h2>
        <p className={styles.text}>
          The window is {w.monthCount} full months, {span}. Delay is the minutes late at the last stop. A trip counts as late
          at {stats.params.lateMinutes} minutes. Night trains are left out. The home page headline uses only the last{" "}
          {stats.headline.months.length} months, so its numbers differ.
        </p>
        <p className={styles.text}>
          <Link href="/">Look up a train</Link> or see <Link href="/#leaderboard">the most delayed trains and lines</Link>.
        </p>
      </main>
      <Footer generatedAt={stats.generatedAt} />
    </>
  );
}
