// Version skew guard. The site redeploys at least daily (the last-7-days data job), so a tab left open overnight runs an
// old build against a new one. Next is meant to notice that on a soft navigation and fall back to a full page load,
// but a tap on a phone was seen to do nothing until the page was reloaded. So:
//   1. When the tab comes back (visible, focus, back/forward cache) it fetches /version.txt once a minute at most;
//      when that names another build, every later navigation is a full page load to the same address.
//   2. A tap during that check waits for it (no request per tap otherwise).
//   3. A soft navigation that has not changed the address after WATCHDOG_MS becomes a full page load to the same address.
// A full load lands on the new build, whose id matches, so this cannot loop. See docs/notes/release.md.

const BUILD = process.env.GP_BUILD_ID ?? "";
const MIN_GAP_MS = 60_000;
export const WATCHDOG_MS = 8_000;

let stale = false;
// A freshly loaded page is current: the first check waits a minute (a back/forward restore forces one).
let lastCheck = typeof window === "undefined" ? 0 : Date.now();
let inflight: Promise<boolean> | null = null;
let watch: number | undefined;

export function isStale(): boolean {
  return stale;
}

/** The check in progress, if any: a tap waits for it instead of starting a soft navigation into a newer build. */
export function pendingCheck(): Promise<boolean> | null {
  return inflight;
}

/** Ask the server which build it serves (at most once a minute unless forced). Resolves true when it is a newer one. */
export function checkDeploy(force = false): Promise<boolean> {
  if (stale) return Promise.resolve(true);
  if (!BUILD) return Promise.resolve(false);
  if (inflight) return inflight;
  if (!force && Date.now() - lastCheck < MIN_GAP_MS) return Promise.resolve(false);
  lastCheck = Date.now();
  inflight = fetch("/version.txt", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : ""))
    .then((text) => {
      const id = text.trim();
      if (/^[\w-]{6,64}$/.test(id) && id !== BUILD) stale = true;
      return stale;
    })
    .catch(() => false)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/** Stop waiting for a soft navigation (the page is unloading, or the visitor went back or forward). */
export function cancelWatch() {
  window.clearTimeout(watch);
  watch = undefined;
}

/** After a soft navigation starts: if the address is still the one it started from in time, load `href` in full.
 * (Only "has not moved" counts as stuck: a page may change its address again after landing, e.g. a search that opens
 * the train page.) */
export function watchSoftNav(href: string) {
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin) return;
  const here = () => trim(window.location.pathname) + window.location.search;
  const from = here();
  if (trim(target.pathname) + target.search === from) return;
  cancelWatch();
  watch = window.setTimeout(() => {
    watch = undefined;
    if (here() === from) window.location.assign(target.href);
  }, WATCHDOG_MS);
}

function hardGo(href: string, mode: "push" | "replace") {
  if (mode === "replace") window.location.replace(href);
  else window.location.assign(href);
}

/** router.push / router.replace that switches to a full page load on a newer deploy and never leaves a dead tap. */
export function softGo(router: { push(href: string): void; replace(href: string): void }, href: string, mode: "push" | "replace" = "push") {
  const go = () => {
    if (stale) return hardGo(href, mode);
    watchSoftNav(href);
    router[mode](href);
  };
  if (inflight) inflight.then(go);
  else go();
}
