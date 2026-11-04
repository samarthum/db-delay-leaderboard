<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Zugmonitor: start here

Read these before changing anything:
1. `docs/STATUS.md`: what is live, how to build, run and test, environment variables, automation, known gaps.
2. `docs/ROADMAP.md`: what is next, open decisions, ideas.
3. `docs/RULES.md`: the owner's product, design, data and publishing rules (they override habits).
4. `docs/notes/<topic>.md` before touching that area: data-pipeline, live-status, live-and-international,
   change-trains, compensation, german-copy, share-cards-and-pages, product-and-ui, release, review-process.

Checks before any push: `npx tsc --noEmit`, `node scripts/check-dict.mjs`, `node scripts/check-brand.mjs`, `npm run build`,
`node tests/tools/serve.mjs &` then `node tests/e2e/pages.mjs`. Publishing is a fast-forward push to `main`; ask the
owner first (see RULES). Keep `docs/STATUS.md` and `docs/ROADMAP.md` current in the same commit as the work.
Never commit keys: they live in Vercel and in a git-ignored `.env.local`.
