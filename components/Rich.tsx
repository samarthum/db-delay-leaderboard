import type { ReactNode } from "react";

/** Renders "text [label](url) **bold** text" as text with links and bold. Only http(s) URLs become links. */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[3] !== undefined ? (
        <strong key={m.index}>{m[3]}</strong>
      ) : (
        <a key={m.index} href={m[2]}>
          {m[1]}
        </a>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
