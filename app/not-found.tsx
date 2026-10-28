import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import styles from "./not-found.module.css";

export const metadata = { title: "Platform not found" };

export default function NotFound() {
  return (
    <>
      <TopBar />
      <main className={`container ${styles.main}`}>
        <div className={`board ${styles.board}`}>
          <p className={styles.code} aria-hidden="true">
            404
          </p>
          <h1 className={styles.title}>Platform not found</h1>
          <p className={styles.text}>
            This page has been cancelled without replacement. We apologise for the inconvenience.
          </p>
          <Link href="/" className={styles.link}>
            Take the replacement bus home <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>
    </>
  );
}
