"""Scan every blob in every commit for secrets before a push or a history change.

  python3 tests/tools/secretscan.py [--known FILE ...]

--known: env-style files (KEY=value) whose values must never appear in the repo (exact match, never printed).
Also checks common key patterns and risky file names. Exit 1 on any hit."""
import argparse, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ap = argparse.ArgumentParser()
ap.add_argument("--known", nargs="*", default=[])
a = ap.parse_args()
known = {}
for f in a.known:
    for l in open(os.path.expanduser(f), errors="ignore"):
        if "=" in l and not l.lstrip().startswith("#"):
            k, v = l.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if len(v) >= 16:
                known[k.strip()] = v
PATTERNS = {
    "aws": r"AKIA[0-9A-Z]{16}",
    "private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "slack": r"xox[abpr]-[0-9A-Za-z-]{10,}",
    "github": r"gh[pousr]_[0-9A-Za-z]{30,}",
    "openai/anthropic": r"sk-(?:ant-|proj-)?[0-9A-Za-z_-]{24,}",
    "elevenlabs": r"\bsk_[0-9a-f]{40,}\b",
    "google": r"AIza[0-9A-Za-z_-]{35}",
    "assignment": r"(?i)(api[_-]?key|secret|password|token|client[_-]?id)\s*[:=]\s*['\"][0-9A-Za-z_\-]{16,}['\"]",
}
RISKY = re.compile(r"(^|/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|auth\.json|credentials.*)$")
git = lambda *x: subprocess.run(["git", "-C", ROOT, *x], capture_output=True).stdout
blobs = {}
for line in git("rev-list", "--all", "--objects").decode().splitlines():
    sha, _, p = line.partition(" ")
    if p:
        blobs.setdefault(sha, p)
hits = set()
for sha, p in blobs.items():
    if git("cat-file", "-t", sha).strip() != b"blob":
        continue
    if RISKY.search(p) and not p.endswith(".example"):
        hits.add(("risky file name", p))
    data = git("cat-file", "-p", sha)
    if len(data) > 5_000_000:
        continue
    text = data.decode("utf-8", errors="ignore")
    for k, v in known.items():
        if v in text:
            hits.add((f"KNOWN SECRET {k}", p))
    for name, rx in PATTERNS.items():
        for m in re.finditer(rx, text):
            if name == "assignment" and re.search(r"(?i)example|placeholder|xxxx|your", m.group(0)):
                continue
            hits.add((name, f"{p}: {m.group(0)[:10]}…"))
print(f"blobs scanned: {len(blobs)}, known values checked: {len(known)}, hits: {len(hits)}")
for h in sorted(hits):
    print("HIT", *h)
sys.exit(1 if hits else 0)
