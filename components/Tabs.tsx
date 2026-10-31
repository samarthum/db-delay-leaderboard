"use client";

import { Children, useEffect, useState, type ReactNode } from "react";

/**
 * A segmented control that swaps one panel in place (Rankings: Routes / Trains / Regional). Every panel is in the
 * HTML, so search engines and no-JS readers get all of them; the address hash (#routes, #trains, #lines) keeps the
 * choice and old jump links still land on the right list.
 */
export function Tabs({ ids, labels, label, children }: { ids: string[]; labels: string[]; label: string; children: ReactNode }) {
  const panels = Children.toArray(children);
  const [on, setOn] = useState(0);
  useEffect(() => {
    const read = () => {
      const i = ids.indexOf(window.location.hash.slice(1));
      if (i >= 0) setOn(i);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [ids]);
  function pick(i: number) {
    setOn(i);
    window.history.replaceState(null, "", i === 0 ? window.location.pathname : `#${ids[i]}`);
  }
  return (
    <>
      <div className={`seg c${labels.length} tight`} role="group" aria-label={label} style={{ marginTop: 16 }}>
        {labels.map((l, i) => (
          <button key={ids[i]} type="button" aria-pressed={on === i} aria-controls={`${ids[i]}-panel`} onClick={() => pick(i)}>
            {l}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div key={ids[i]} id={`${ids[i]}-panel`} hidden={on !== i}>
          {p}
        </div>
      ))}
    </>
  );
}
