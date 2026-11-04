import { getStats } from "@/lib/data";
import { methodItems } from "@/lib/methodFaq";
import { plainText } from "@/lib/jsonld";
import { methodMetadata } from "@/lib/seo";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Credits } from "../Credits";
import { PageLd } from "../PageLd";
import { Rich } from "../Rich";
import styles from "./Method.module.css";

function Item({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className={styles.item}>
      <summary className={styles.summary}>
        <span>{q}</span>
        <span className={styles.icon} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

/** How we measure: every question and answer comes from methodItems(), the same list the FAQ structured data and llms-full.txt use. */
export function MethodPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const items = methodItems(lang);
  const faq = items.map((i) => ({ q: i.q, a: plainText([...i.paras, ...(i.bullets ?? [])].join(" ")) }));

  return (
    <main id="main" className="container page">
      <PageLd lang={lang} path={route(lang, "method")} meta={methodMetadata(lang)} name={t("method.title")} faq={faq} />
      <h1 className="h1" style={{ marginTop: 20 }}>
        {t("method.title")}
      </h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {t("method.sub")}
      </p>

      <div className={styles.list}>
        {items.map((item, i) => (
          <Item key={i} q={item.q}>
            {item.paras.map((p, j) => (
              <p key={j}>
                <Rich text={p} />
              </p>
            ))}
            {item.bullets ? (
              <ul className={styles.bullets}>
                {item.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            ) : null}
          </Item>
        ))}
      </div>

      <Credits lang={lang} generatedAt={getStats().generatedAt} />
    </main>
  );
}
