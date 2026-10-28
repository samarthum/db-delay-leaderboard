import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import styles from "./TopBar.module.css";

const LINKS = [
  { href: "/#leaderboard", label: "Top 10" },
  { href: "/#map", label: "Map" },
  { href: "/#monthly", label: "Months" },
  { href: "/#methodology", label: "FAQ" },
];

export function TopBar() {
  return (
    <div className={styles.bar}>
      <nav className={`container ${styles.inner}`} aria-label="Site">
        <Link href="/" className={styles.brand}>
          <span className={styles.dot} aria-hidden="true" />
          {SITE_NAME}
        </Link>
        <ul className={styles.links}>
          {LINKS.map((l, i) => (
            <li key={l.href} className={i === 2 ? styles.wide : undefined}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
