import type { Category, HeadlineStats, HistBin, Stats } from "@/lib/types";
import { fmt1, fmtInt, fmtMin, fmtPct, monthLabel } from "@/lib/format";
import styles from "./Hero.module.css";

/** Lateness bands, light to dark. The first band is the grey "under 6 min". */
const BAND_COPY = [
  { color: "#d9d4c7", text: "#1f2430", label: "Under 6 min late" },
  { color: "#f26a21", text: "#1f2430", label: "6 to 14 min" },
  { color: "#ec0016", text: "#ffffff", label: "15 to 59 min" },
  { color: "#8e0010", text: "#ffffff", label: "1 hour or more" },
];

function fmtShare(n: number): string {
  return n < 1 && n > 0 ? `${n.toFixed(1)}%` : `${Math.round(n)}%`;
}

function shareFrom(bands: HistBin[], minutes: number): number {
  return bands.filter((b) => b.lo !== null && b.lo >= minutes).reduce((s, b) => s + b.share, 0);
}

function BandBar({ bands, label }: { bands: HistBin[]; label: string }) {
  const described = bands.map((b, i) => `${fmtShare(b.share)} ${BAND_COPY[i].label.toLowerCase()}`).join(", ");
  return (
    <div className={styles.bar} role="img" aria-label={`${label}: ${described}`}>
      {bands.map((b, i) => (
        <span
          key={b.label}
          className={styles.segment}
          style={{ flexGrow: b.share, background: BAND_COPY[i].color, color: BAND_COPY[i].text }}
        >
          {b.share >= 9 ? fmtShare(b.share) : null}
        </span>
      ))}
    </div>
  );
}

export function Hero({ stats }: { stats: Stats }) {
  const { months, categories } = stats.headline;
  const ld = categories.longDistance;
  const reg = categories.regional;
  const span = `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`;
  const columns: [Category, string, HeadlineStats][] = [
    ["longDistance", "Long-distance", ld],
    ["regional", "Regional", reg],
  ];

  return (
    <header className={`container ${styles.hero}`}>
      <p className={styles.kicker}>{span}</p>
      <h1 className={styles.title}>
        <span className={styles.lead}>The average long-distance train in Germany arrives</span>{" "}
        <span className={styles.big}>{fmtMin(ld.avgDelayMin)} min late</span>
      </h1>
      <p className={styles.lede}>
        {fmtShare(shareFrom(ld.bands, 15))} arrive 15 minutes or more late. {fmtShare(shareFrom(ld.bands, 60))} arrive an
        hour or more late.
      </p>
      <BandBar bands={ld.bands} label="Long-distance trips" />

      <h2 className={styles.second}>
        Regional trains arrive <span className={styles.accent}>{fmt1(reg.avgDelayMin)} min</span> late on average.
      </h2>
      <p className={styles.lede}>{fmtShare(shareFrom(reg.bands, 15))} arrive 15 minutes or more late.</p>
      <BandBar bands={reg.bands} label="Regional trips" />

      <table className={styles.table}>
        <caption className="visually-hidden">Trips by how late they arrived, {span}</caption>
        <thead>
          <tr>
            <td />
            {columns.map(([key, label]) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BAND_COPY.map((band, i) => (
            <tr key={band.label}>
              <th scope="row">
                <span className={styles.swatch} style={{ background: band.color }} aria-hidden="true" />
                {band.label}
              </th>
              {columns.map(([key, , c]) => (
                <td key={key}>{fmtShare(c.bands[i].share)}</td>
              ))}
            </tr>
          ))}
          <tr className={styles.rule}>
            <th scope="row">Average</th>
            {columns.map(([key, , c]) => (
              <td key={key}>{fmt1(c.avgDelayMin)} min</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Of the planned trip</th>
            {columns.map(([key, , c]) => (
              <td key={key}>{fmtPct(c.avgDelayPct)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Cancelled</th>
            {columns.map(([key, , c]) => (
              <td key={key}>{fmt1(c.fullCancelPct)}%</td>
            ))}
          </tr>
        </tbody>
      </table>

      <p className={styles.note}>
        Delay at each train&rsquo;s last stop, {span}. {fmtInt(ld.measured)} long-distance and {fmtInt(reg.measured)}{" "}
        regional trips. Night trains and S-Bahn are not included.
      </p>
    </header>
  );
}
