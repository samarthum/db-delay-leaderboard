import Link from "next/link";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Arrow } from "../Arrow";
import { ConnectionTool } from "../ConnectionTool";

/** "Change trains": the connection tool on its own page. The tab lands here, a route page links here with the station set. */
export function ChangePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  return (
    <main id="main" className="container page">
      <div style={{ marginTop: 20 }}>
        <ConnectionTool lang={lang} heading="h1" />
      </div>
      <p className="note" style={{ marginTop: 28 }}>
        <Link href={route(lang, "home")} className="tl" prefetch={false}>
          {t("conn.page.next")} <Arrow />
        </Link>
      </p>
    </main>
  );
}
