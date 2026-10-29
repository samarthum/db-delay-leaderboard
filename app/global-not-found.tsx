import Link from "next/link";
import { fontClasses } from "@/lib/fonts";
import { makeT } from "@/lib/t";
import "./globals.css";
import styles from "./not-found.module.css";

export const metadata = { title: "Platform not found · Gleis nicht gefunden" };

/** Shown for every unknown address. Shows both languages, since the visitor's language is not known here. */
export default function GlobalNotFound() {
  const en = makeT("en");
  const de = makeT("de");
  return (
    <html lang="en" className={fontClasses}>
      <body>
        <main className={`container ${styles.main}`}>
          <div className={`board ${styles.board}`}>
            <p className={styles.code} aria-hidden="true">
              404
            </p>
            <h1 className={styles.title}>{en("notfound.title")}</h1>
            <p className={styles.text}>{en("notfound.text")}</p>
            <Link href="/" className={styles.link}>
              {en("notfound.home")} <span aria-hidden="true">→</span>
            </Link>
            <hr className={styles.rule} />
            <p className={styles.titleDe} lang="de">
              {de("notfound.title")}
            </p>
            <p className={styles.text} lang="de">
              {de("notfound.text")}
            </p>
            <Link href="/de/" className={styles.link} lang="de">
              {de("notfound.home")} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
