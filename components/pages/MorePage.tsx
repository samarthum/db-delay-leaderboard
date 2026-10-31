import Link from "next/link";
import { otherLangPath, route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { Arrow } from "../Arrow";

/** The pages behind the fourth tab: the network, the recap, the method and the language. Plain list, one line each. */
export function MorePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const other = otherLangPath(route(lang, "more"));
  const items: { href: string; title: Key; sub: Key; hrefLang?: string }[] = [
    { href: route(lang, "network"), title: "more.network", sub: "more.networkSub" },
    { href: route(lang, "recap"), title: "more.recap", sub: "more.recapSub" },
    { href: route(lang, "compensation"), title: "more.compensation", sub: "more.compensationSub" },
    { href: route(lang, "method"), title: "more.method", sub: "more.methodSub" },
    { href: other.path, title: "more.lang", sub: "more.langSub", hrefLang: other.lang },
  ];
  return (
    <main id="main" className="container page">
      <h1 className="h1" style={{ marginTop: 20 }}>
        {t("more.title")}
      </h1>
      <ul className="linklist">
        {items.map((it) => (
          <li key={it.title}>
            <Link href={it.href} hrefLang={it.hrefLang} lang={it.hrefLang} prefetch={false}>
              <span>
                <b>{it.hrefLang ? (it.hrefLang === "de" ? t("lang.de") : t("lang.en")) : t(it.title)}</b>
                <small>{t(it.sub)}</small>
              </span>
              <Arrow />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
