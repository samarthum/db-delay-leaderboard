import { getMonthly, getStats } from "@/lib/data";
import { homeMetadata } from "@/lib/seo";
import { RankingProvider } from "@/components/Ranking";
import { TopBar } from "@/components/TopBar";
import { Hero } from "@/components/Hero";
import { Leaderboard } from "@/components/Leaderboard";
import { MonthlyChart } from "@/components/MonthlyChart";
import { SectionHeader } from "@/components/SectionHeader";
import { Methodology } from "@/components/Methodology";
import { Footer } from "@/components/Footer";

export const metadata = homeMetadata();

export default function Home() {
  const stats = getStats();

  return (
    <>
      <TopBar />
      <main>
        <Hero stats={stats} />
        <section id="monthly" className="section" aria-labelledby="monthly-title">
          <div className="container">
            <SectionHeader title="Month by month" id="monthly-title" />
            <MonthlyChart series={getMonthly().series} />
          </div>
        </section>
        <RankingProvider>
          <Leaderboard stats={stats} />
        </RankingProvider>
        <Methodology stats={stats} />
      </main>
      <Footer generatedAt={stats.generatedAt} />
    </>
  );
}
