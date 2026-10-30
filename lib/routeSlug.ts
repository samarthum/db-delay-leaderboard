/**
 * Route page addresses: "Köln Hbf" + "Berlin Hauptbahnhof" -> "koeln-hbf-berlin-hbf". The same rule as
 * scripts/routes.py (slugify + short), so a search result can link to the page without asking the server.
 */
export function shortStation(name: string): string {
  let n = name.replace("Hauptbahnhof", "Hbf");
  if (n === "Frankfurt am Main Flughafen Fernbahnhof") return "Frankfurt Flughafen";
  n = n.replace("Frankfurt (Main) ", "Frankfurt ");
  for (const suffix of [" (Westf)", " (Breisgau)", " (Saale)", " (Oder)"]) n = n.replace(suffix, "");
  return n;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function routeSlug(from: string, to: string): string {
  return `${slugify(shortStation(from))}-${slugify(shortStation(to))}`;
}
