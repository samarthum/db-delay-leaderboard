import { getMonthly, getStats, getTopDetails, getTrainSlugs } from "@/lib/data";
import { fmt1, monthLabel } from "@/lib/format";
import { homeMetadata } from "@/lib/seo";
import { ModeProvider } from "@/components/ModeContext";
import { TopBar } from "@/components/TopBar";
import { Hero } from "@/components/Hero";
import { Leaderboard } from "@/components/Leaderboard";
import { MapSection } from "@/components/MapSection";
import { MonthlyChart } from "@/components/MonthlyChart";
import { SectionHeader } from "@/components/SectionHeader";
import { Extras } from "@/components/Extras";
import { Methodology } from "@/components/Methodology";
import { Footer } from "@/components/Footer";
import styles from "./page.module.css";

export const metadata = homeMetadata();

export default function Home() {
  const stats = getStats();
  const monthly = getMonthly();
  const { topN } = stats.params;
  const months = monthly.months;
  const worst = months.reduce((a, b) => (b.avgDelayMin > a.avgDelayMin ? b : a));
  const best = months.reduce((a, b) => (b.avgDelayMin < a.avgDelayMin ? b : a));

  return (
    <ModeProvider>
      <TopBar />
      <main>
        <Hero stats={stats} />
        <Leaderboard stats={stats} />
        <MapSection
          lists={{ minutes: getTopDetails("minutes", topN), percent: getTopDetails("percent", topN) }}
          stations={stats.stations}
        />
        <section id="monthly" className="section" aria-labelledby="monthly-title">
          <div className="container">
            <SectionHeader eyebrow="Month by month" title="Some months are worse" id="monthly-title">
              <p>
                {monthLabel(worst.month)} was the worst month at {fmt1(worst.avgDelayMin)} min late on
                average; {monthLabel(best.month)} the calmest at {fmt1(best.avgDelayMin)} min. Calm is
                relative.
              </p>
            </SectionHeader>
            <div className={styles.chartCard}>
              <MonthlyChart months={months} />
              <p className={styles.caption}>
                Average delay at the last German stop, all long-distance runs, per month of scheduled
                departure.
              </p>
            </div>
          </div>
        </section>
        <Extras extras={stats.extras} pageSlugs={new Set(getTrainSlugs())} />
        <Methodology stats={stats} />
      </main>
      <Footer generatedAt={stats.generatedAt} />
    </ModeProvider>
  );
}
