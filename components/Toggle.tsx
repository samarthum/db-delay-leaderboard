"use client";

import { useRef } from "react";
import styles from "./Toggle.module.css";

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

/** Two-option tablist with a sliding thumb. Arrow keys, Home and End move between the options. */
export function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
  idPrefix,
}: {
  options: readonly [ToggleOption<T>, ToggleOption<T>];
  value: T;
  onChange: (v: T) => void;
  label: string;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = options.findIndex((o) => o.value === value);

  function onKeyDown(e: React.KeyboardEvent) {
    const next = { ArrowLeft: 1 - index, ArrowRight: 1 - index, Home: 0, End: 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={styles.toggle} role="tablist" aria-label={label} data-index={index}>
      <span className={styles.thumb} aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${o.value}`}
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(o.value)}
          onKeyDown={onKeyDown}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
