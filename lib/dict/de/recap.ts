import type { recap } from "../en/recap";

export const recapDe: Record<keyof typeof recap, string> = {
  "recap.kicker": "Rückblick · {span} ({n} Monate)",
  "recap.title": "Fernzüge in Deutschland",
  "recap.lede": "ICE, IC, EC und die anderen Fernzüge. {measured} Fahrten mit gemessener Ankunft, von {runs} geplanten.",
  "recap.fact.avg": "zu spät im Schnitt am letzten Halt",
  "recap.fact.late": "kommen 15 Minuten oder mehr zu spät an",
  "recap.fact.late60": "kommen eine Stunde oder mehr zu spät an",
  "recap.fact.canc": "der geplanten Züge fallen aus",
  "recap.regional": "Regionalzüge im selben Zeitraum: im Schnitt {avg} Min. zu spät, {late} mit 15 Minuten oder mehr Verspätung, {canc} ausgefallen.",
  "recap.share": "Rückblick teilen",
  "recap.shareText": "Fernzüge in Deutschland, {span}: im Schnitt {avg} Min. zu spät, {late} mit 15 Minuten oder mehr Verspätung, {canc} ausgefallen.",
  "recap.pictures": "Bilder zum Posten",
  "recap.imgWide": "Rückblick-Karte für {span}",
  "recap.imgTall": "Hohe Rückblick-Karte für {span}",
  "recap.dlWide": "Breit herunterladen (1200 × 630)",
  "recap.dlTall": "Hoch herunterladen (1080 × 1920)",
  "recap.how": "So wird gezählt",
  "recap.howText": "Der Zeitraum umfasst {n} volle Monate, {span}. Verspätung sind die Minuten zu spät am letzten Halt. Eine Fahrt gilt ab {late} Minuten als verspätet. Nachtzüge sind ausgenommen.",
  "recap.links": "[Zug nachschlagen]({home}) oder [die verspätetsten Züge und Linien]({ranking}) ansehen.",
};
