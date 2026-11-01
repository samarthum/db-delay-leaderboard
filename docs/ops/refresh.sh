#!/usr/bin/env bash
# Weekly refresh of the trains-from-abroad data for German Punctuality (systemd user timer gp-refresh.timer).
# Works in its own clone ($GP_REFRESH_DIR/repo, default ~/gp-refresh/repo) so it never touches the checkout other sessions use.
# Steps: fast-forward to origin/main -> scripts/foreign_origins.mjs (DB Timetables) -> scripts/abroad_trips.mjs
# (Transitous) -> if only those two data files changed, are valid JSON and did not shrink: commit + push to main.
set -euo pipefail
# Machine settings (override in the systemd unit): node on PATH, a work folder, the DB key file.
BASE_DIR=${GP_REFRESH_DIR:-$HOME/gp-refresh}
DIR=$BASE_DIR/repo
LOG=$BASE_DIR/last.log
export DB_ENV_FILE=${DB_ENV_FILE:-$BASE_DIR/db.env}
mkdir -p "$BASE_DIR"
exec > >(tee "$LOG") 2>&1
echo "start $(date -u +%FT%TZ)"
if [ ! -d "$DIR/.git" ]; then git clone -q https://github.com/samarthum/db-delay-leaderboard.git "$DIR"; fi
cd "$DIR"
git fetch -q origin main
git checkout -q -B main origin/main
git reset -q --hard origin/main

count() { node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$1','utf8'))).length)"; }
before_o=$(count data/foreign-origins.json); before_a=$(count data/abroad-trips.json)

node scripts/foreign_origins.mjs
node scripts/abroad_trips.mjs | head -1

after_o=$(count data/foreign-origins.json); after_a=$(count data/abroad-trips.json)
echo "foreign-origins $before_o -> $after_o, abroad-trips $before_a -> $after_a"

changed=$(git status --porcelain | awk '{print $2}' | sort | tr '\n' ' ')
if [ -z "$changed" ]; then echo "no change"; exit 0; fi
allowed="data/abroad-trips.json data/foreign-origins.json"
for f in $changed; do case " $allowed " in *" $f "*) ;; *) echo "REFUSE: unexpected change $f"; exit 1 ;; esac; done
if [ "$after_o" -lt "$before_o" ] || [ "$after_a" -lt "$before_a" ]; then echo "REFUSE: a file shrank"; exit 1; fi

git -c user.name="Samarth U Mamadapur" -c user.email="16480420+samarthum@users.noreply.github.com" \
  commit -qm "Weekly refresh: trains from abroad ($after_o origins, $after_a abroad trips)" -- $changed
# Fast-forward only: if main moved during the run, try once more on top of it.
if ! git push -q origin main; then
  git fetch -q origin main && git rebase -q origin/main && git push -q origin main
fi
echo "pushed $(git rev-parse --short HEAD) $(date -u +%FT%TZ)"
