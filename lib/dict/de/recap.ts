import type { recap } from "../en/recap";

export const recapDe: Record<keyof typeof recap, string> = {
  "recap.kicker": "Rückblick · {span} ({n} Monate)",
  "recap.title": "Fernzüge in Deutschland",
  "recap.lede": "{measured} von {runs} geplanten Fahrten mit gemessener Ankunft.",
  "recap.fact.avg": "im Schnitt zu spät am letzten Halt",
  "recap.fact.late": "kommen mindestens 15 Minuten zu spät an",
  "recap.fact.late60": "kommen eine Stunde oder mehr zu spät an",
  "recap.fact.canc": "der geplanten Fahrten fallen aus",
  "recap.regional": "Regionalzüge im selben Zeitraum: im Schnitt {avg} Min. zu spät, {late} mit 15 Minuten oder mehr Verspätung, {canc} ausgefallen.",
  "recap.share": "Rückblick teilen",
  "recap.shareText": "Fernzüge in Deutschland, {span}: im Schnitt {avg} Min. zu spät, {late} mindestens 15 Minuten zu spät, {canc} ausgefallen.",
  "recap.pictures": "Bilder zum Posten",
  "recap.imgWide": "Rückblick-Karte für {span}",
  "recap.imgTall": "Rückblick-Karte im Hochformat für {span}",
  "recap.dlWide": "Querformat herunterladen (1200 × 630)",
  "recap.dlTall": "Hochformat herunterladen (1080 × 1920)",
  "recap.how": "So wird gezählt",
  "recap.howText": "Der Zeitraum umfasst {n} volle Monate, {span}. Verspätung heißt hier: Minuten zu spät am letzten Halt. Eine Fahrt gilt ab {late} Minuten als verspätet. Nachtzüge sind ausgenommen.",
  "recap.links": "[Zug suchen]({home}) oder [die unpünktlichsten Züge und Linien]({ranking}) ansehen.",
};
