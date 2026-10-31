/**
 * An arrow drawn as a shape: Archivo's Latin subset has no "→", and a fallback font's arrow would not match the
 * weight of the text next to it. Sized in em so it follows the text; decorative, so hidden from screen readers.
 */
export function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: "inline-block", width: "0.82em", height: "0.82em", verticalAlign: "-0.04em", transform: back ? "rotate(180deg)" : undefined }}
    >
      <path d="M2 12h18M13 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

/**
 * "Köln Hbf → Berlin Hbf": a station name never breaks inside, and the arrow stays with the first name. The one place the
 * line may break is the space after the arrow, so a long pair wraps to two lines instead of running off a phone screen.
 * A screen reader hears "to".
 */
export function RouteName({ from, to, word }: { from: string; to: string; word: string }) {
  return (
    <>
      <span className="nobr">
        {from} <Arrow />
      </span>{" "}
      <span className="visually-hidden">{word}</span>{" "}
      <span className="nobr">{to}</span>
    </>
  );
}
