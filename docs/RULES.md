# Working rules (product, design, data, process)

These came from the owner over many sessions. Follow them unless he says otherwise.

## Product
- Zugmonitor is THE place people check their train: serious and trustworthy, not a joke or a leaderboard gag.
  One promise ("How late is your train?"), one box, one number per view. No clutter. Every number comes from the data.
- Visitors are "normies": no trip counts under names, no jargon. The headline number is the AVERAGE delay in
  minutes; the share 15+ min late is second; DB's own 6-minute rule sits next to the 15-minute figure.
- Search must land on the destination: one obvious page (route pair, train) -> navigate straight to it; never show a
  weaker inline copy of a page that exists. Every per-train feature must also appear on the search result card
  (only 50 trains have a page).
- Navigation: at most four bottom tabs, each a real page with icon + one-line label; no catch-all "More" tab.
- A first-time visitor must never be confused: judge flows by entry point (shared card, search engine, home) and
  tap budget, not by looks.
- New features get their own static URL, not a query string. Share pictures are portrait and must look good.
- Tone: deadpan and factual. No live claim the data does not support: say "no delay reported", never "on time".
- Lean, no spend: free data and free tiers only. Never create an account or key in the owner's name; sign-ups,
  captchas and legal tick boxes are his steps.

## Design ("printed timetable", locked)
- Paper `#FAFAF8` and ink, Archivo only (variable width axis), sentence case, hairline rules, one type scale.
- Colour only for data; yellow only for selection. Avoid "AI slop": cards everywhere, pills, chips, coloured icon
  rows, accent rails, uppercase labels. Prefer typography, spacing and simple diagrams.
- Test every page at 390 px and 320 px (German is longer) and desktop 1280; no horizontal overflow, no console errors.
  Test every state of a control (idle, focused, typing, result) for layout shift.
- Archivo has no U+2192 arrow: draw it as SVG (`components/Arrow.tsx`).

## Copy and review
- English and German for every string (`lib/dict/{en,de}`), parity checked by `scripts/check-dict.mjs`.
- No native German speaker on the team: every new German string goes to an independent reviewer and its fixes are
  applied. Rules and glossary: `docs/notes/german-copy.md`.
- Legal/rights copy (compensation) is reviewed by a rights expert against the primary sources (Regulation (EU)
  2021/782, DB conditions of carriage) in rounds until a round returns no must-fix.
- The owner wants experts to review, not himself; he only gives the final yes.

## Data
- Verify every new number against the raw Parquet with an independent query of a different shape that reproduces
  the pipeline's scope rules (run belongs to the month of its scheduled start; only window months; same type list).
- Merge only new fields into committed data files (e.g. `data/routes.json`, `data/connection-pairs.json`); never
  overwrite them with a fresh compute wholesale (the local data window can differ from the committed one).
- Free data only; credit every source (Credits component on "How we measure", README).
- Transitous (live abroad) may only be used while the project stays open source and non-commercial, with attribution.

## Process
- Publishing = fast-forward push to `main` (`git merge-base --is-ancestor origin/main HEAD` first; never force).
  Ask the owner first, unless he has said "build, verify and push" for that piece of work, or that reviewers' clean
  final round is the go. Rollback (force-push) also needs his word.
- Before saying what is live, `git fetch` and compare: other agents may push to `main`.
- After a push, poll a marker only the new build serves (a new URL or file), then run the relevant e2e suite once
  with `BASE=https://zugmonitor.de` (the old `german-punctuality.vercel.app` redirects there). Do not run full production sweeps repeatedly: Vercel's bot
  protection blocked the server IP after many sweeps.
- Run `tests/tools/secretscan.py` before any change to history or visibility.
- Updates to the owner: plain language, one decision at a time, say what is live vs branch vs preview, list what to
  check on a real phone. Short: one acknowledgement, then the result (no interim pings).
