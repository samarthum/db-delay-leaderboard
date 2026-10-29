import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import styles from "./TopBar.module.css";

export function TopBar() {
  return (
    <div className={styles.bar}>
      <nav className={`container ${styles.inner}`} aria-label="Site">
        <Link href="/" className={styles.brand}>
          <span className={styles.dot} aria-hidden="true" />
          {SITE_NAME}
        </Link>
        <Link href="/recap/" className={styles.link} prefetch={false}>
          Recap
        </Link>
      </nav>
    </div>
  );
}
