import Link from "next/link";
import { getConnectionsMeta } from "@/lib/data";
import { spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Arrow } from "../Arrow";
import { ChangeTrains } from "../ChangeTrains";
import { TypicalGuide } from "../TypicalGuide";

/**
 * "Change trains": the question the way the trip is, train you arrive on, station, train you take next; the answer is
 * what really happened between those two trains. Under it, for a visitor who does not know the trains, the typical
 * change at a station, labelled as the rough guide it is.
 */
export function ChangePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const w = getConnectionsMeta();
  const span = w ? spanLabel(w.firstMonth, w.lastMonth, lang) : "";
  return (
    <main id="main" className="container page">
      <h1 className="h1" style={{ marginTop: 20 }}>
        {t("conn.title")}
      </h1>
      <div style={{ maxWidth: 720 }}>
        <ChangeTrains lang={lang} span={span} />
        <TypicalGuide lang={lang} />
      </div>
      <p className="note" style={{ marginTop: 28 }}>
        <Link href={route(lang, "home")} className="tl" prefetch={false}>
          {t("conn.page.next")} <Arrow />
        </Link>
      </p>
    </main>
  );
}
