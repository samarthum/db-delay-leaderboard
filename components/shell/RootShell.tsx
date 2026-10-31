import type { ReactNode } from "react";
import { fontClasses } from "@/lib/fonts";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { TabBar } from "./TabBar";
import "@/app/globals.css";
import "@/app/ui.css";

/** The <html> document for one language: skip link, header, page, a row of footer links and the bottom tab bar on phones. */
export function RootShell({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = makeT(lang);
  return (
    <html lang={lang} className={fontClasses}>
      <body>
        <a href="#main" className="skip">
          {t("skip")}
        </a>
        <SiteHeader lang={lang} />
        {children}
        <SiteFooter lang={lang} />
        <TabBar lang={lang} />
      </body>
    </html>
  );
}
