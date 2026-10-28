import { DATA_SOURCE_URL, REPO_URL, SITE_NAME } from "@/lib/site";
import { fmtDate } from "./pageFormat";
import styles from "./Footer.module.css";

export function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.brand}>{SITE_NAME}</p>
        <p className={styles.tag}>Your connection is not guaranteed.</p>
        <ul className={styles.credits}>
          <li>
            Data: Deutsche Bahn via <a href={DATA_SOURCE_URL}>piebro/deutsche-bahn-data</a>, CC BY 4.0
          </li>
          <li>
            Station coordinates: <a href="https://github.com/trainline-eu/stations">Trainline stations</a>{" "}
            (ODbL)
          </li>
          <li>
            Map: <a href="https://openfreemap.org">OpenFreeMap</a>, © OpenMapTiles, data ©{" "}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>
          </li>
          <li>Not affiliated with Deutsche Bahn.</li>
          <li>
            Source code: <a href={REPO_URL}>GitHub</a>
          </li>
        </ul>
        <p className={styles.updated}>
          Data refreshed weekly · last updated <time dateTime={generatedAt}>{fmtDate(generatedAt)}</time>
        </p>
      </div>
    </footer>
  );
}
