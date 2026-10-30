"use client";

import { useEffect, useState } from "react";
import { Arrow } from "./Arrow";
import styles from "@/app/not-found.module.css";

/**
 * A search box for the 404, filled from the address when it parses ("/route/koeln-berlin/" -> "koeln berlin"). A plain form
 * to the home page, so it works without JavaScript too; the home page reads ?q=.
 */
export function NotFoundSearch({ action, label, placeholder }: { action: string; label: string; placeholder: string }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const last = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
    setValue(/^[a-z0-9-]{3,}$/i.test(last) ? last.replace(/-/g, " ") : "");
  }, []);
  return (
    <form className={styles.form} action={action} method="get" role="search">
      <label className="visually-hidden" htmlFor={`nf-${action}`}>
        {label}
      </label>
      <input id={`nf-${action}`} name="q" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      <button type="submit" aria-label={label}>
        <Arrow />
      </button>
    </form>
  );
}
