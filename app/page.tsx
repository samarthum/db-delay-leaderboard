import { getMonthly, getStats, getTopDetails } from "@/lib/data";
import { fmt1, monthLabel } from "@/lib/format";
import { homeMetadata } from "@/lib/seo";
import { ModeProvider } from "@/components/ModeContext";
import { TopBar } from "@/components/TopBar";
import { Hero } from "@/components/Hero";
import { Leaderboard } from "@/components/Leaderboard";
import { MapSection } from "@/components/MapSection";
import { MonthlyChart } from "@/components/MonthlyChart";
import { SectionHeader } from "@/components/SectionHeader";
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
        <Hero window={stats.window} />
        <Leaderboard stats={stats} />
        <MapSection
          lists={{ minutes: getTopDetails("minutes", topN), percent: getTopDetails("percent", topN) }}
          stations={stats.stations}
        />
        <section id="monthly" className="section" aria-labelledby="monthly-title">
          <div className="container">
            <SectionHeader title="Month by month" id="monthly-title">
              <p>
                All long-distance trains, average minutes late. The worst month was{" "}
                {monthLabel(worst.month)} ({fmt1(worst.avgDelayMin)} min), the best was{" "}
                {monthLabel(best.month)} ({fmt1(best.avgDelayMin)} min).
              </p>
            </SectionHeader>
            <div className={styles.chartCard}>
              <MonthlyChart months={months} />
            </div>
          </div>
        </section>
        <Methodology stats={stats} />
      </main>
      <Footer generatedAt={stats.generatedAt} />
    </ModeProvider>
  );
}
