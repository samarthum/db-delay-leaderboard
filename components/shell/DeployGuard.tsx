"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cancelWatch, checkDeploy, isStale, pendingCheck, watchSoftNav } from "@/lib/deploy";

/** Every page: link taps keep working when the site was redeployed while the tab was open (lib/deploy.ts). */
export function DeployGuard() {
  const router = useRouter();
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkDeploy();
    };
    const onFocus = () => void checkDeploy();
    const onShow = (e: PageTransitionEvent) => {
      cancelWatch();
      if (e.persisted) void checkDeploy(true);
    };
    // Window capture runs before React's own listeners, so a Next <Link> never starts a soft navigation into a newer build.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (isStale()) {
        e.preventDefault();
        e.stopPropagation();
        window.location.assign(url.href);
        return;
      }
      const check = pendingCheck();
      if (check) {
        e.preventDefault();
        e.stopPropagation();
        check.then((newer) => {
          if (newer) window.location.assign(url.href);
          else {
            watchSoftNav(url.href);
            router.push(url.pathname + url.search + url.hash);
          }
        });
        return;
      }
      watchSoftNav(url.href);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("pagehide", cancelWatch);
    window.addEventListener("popstate", cancelWatch);
    window.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("pagehide", cancelWatch);
      window.removeEventListener("popstate", cancelWatch);
      window.removeEventListener("click", onClick, true);
    };
  }, [router]);
  return null;
}
