import Link from "next/link";
import { fontClasses } from "@/lib/fonts";
import { makeT } from "@/lib/t";
import { NotFoundSearch } from "@/components/NotFoundSearch";
import "./globals.css";
import "./ui.css";
import styles from "./not-found.module.css";

export const metadata = { title: "Page not found · Seite nicht gefunden" };

/** Shown for every unknown address, in both languages: the visitor's language is not known here. A plain message and a search box. */
export default function GlobalNotFound() {
  const en = makeT("en");
  const de = makeT("de");
  return (
    <html lang="en" className={fontClasses}>
      <body>
        <main className={`container ${styles.main}`}>
          <Link href="/" className={styles.brand}>
            German Punctuality
          </Link>
          <h1 className={`h1 ${styles.title}`}>{en("notfound.title2")}</h1>
          <p className={styles.text}>{en("notfound.text2")}</p>
          <NotFoundSearch action="/" label={en("notfound.go")} placeholder={en("home.placeholder")} />
          <div className={styles.de} lang="de">
            <h2 className="sec-h">{de("notfound.title2")}</h2>
            <p className={styles.text}>{de("notfound.text2")}</p>
            <NotFoundSearch action="/de/" label={de("notfound.go")} placeholder={de("home.placeholder")} />
          </div>
        </main>
      </body>
    </html>
  );
}
