import type { WindowInfo } from "@/lib/types";
import { monthLabel } from "@/lib/format";
import styles from "./Hero.module.css";

export function Hero({ window: w }: { window: WindowInfo }) {
  return (
    <header className={`container ${styles.hero}`}>
      <h1 className={styles.title}>
        Deutsche Bahn&rsquo;s <span className={styles.accent}>most delayed</span> trains
      </h1>
      <p className={styles.lede}>
        Long-distance trains, ranked by how late they arrive. {monthLabel(w.firstMonth)} to{" "}
        {monthLabel(w.lastMonth)}.
      </p>
    </header>
  );
}
