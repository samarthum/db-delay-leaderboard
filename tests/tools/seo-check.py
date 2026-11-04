"""SEO / answer-engine checks over a built out/ directory (no server needed).

Usage: python3 -I tests/tools/seo-check.py out [--all]   (after npm run build; no server needed)
Checks the key page types; --all checks every HTML page for the cheap invariants (title, description, canonical,
hreflang pair, one h1, JSON-LD parses, no old brand).
"""
import json, os, re, sys, html, collections

out = sys.argv[1]
ALL = "--all" in sys.argv
SITE = "https://zugmonitor.de"
problems = []
notes = []

def read(p):
    return open(os.path.join(out, p), encoding="utf8").read()

def page_path(url_path):
    return os.path.join(url_path.strip("/"), "index.html") if url_path.strip("/") else "index.html"

def one(rx, s, flags=0):
    m = re.search(rx, s, flags)
    return html.unescape(m.group(1)) if m else None

def ld_blocks(s):
    blocks = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            blocks.append(json.loads(m.group(1)))
        except Exception as e:
            problems.append(f"invalid JSON-LD: {e}")
    return blocks

def nodes(blocks):
    for b in blocks:
        for n in b.get("@graph", [b]):
            yield n

def check_page(url_path, strict=True):
    s = read(page_path(url_path))
    where = url_path
    title = one(r"<title>([^<]*)</title>", s)
    desc = one(r'<meta name="description" content="([^"]*)"', s)
    canon = one(r'<link rel="canonical" href="([^"]*)"', s)
    robots = one(r'<meta name="robots" content="([^"]*)"', s)
    h1s = re.findall(r"<h1[ >]", s)
    if not title: problems.append(f"{where}: no <title>")
    elif strict and len(title) > 75: notes.append(f"{where}: long title ({len(title)}): {title}")
    if not desc: problems.append(f"{where}: no meta description")
    elif strict and len(desc) > 200: notes.append(f"{where}: long description ({len(desc)})")
    if canon != SITE + url_path: problems.append(f"{where}: canonical {canon}")
    if len(h1s) != 1: problems.append(f"{where}: {len(h1s)} <h1>")
    if re.search(r"german punctuality|german-punctuality", s, re.I): problems.append(f"{where}: old brand")
    langs = re.findall(r'<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"', s)
    if len({l for l, _ in langs}) < 3: problems.append(f"{where}: hreflang set {langs}")
    blocks = ld_blocks(s)
    if not blocks and robots is None: problems.append(f"{where}: no JSON-LD")
    for n in nodes(blocks):
        for key in ("url", "@id"):
            v = n.get(key)
            if isinstance(v, str) and v.startswith("http") and not v.startswith(SITE) and "github" not in v and "creativecommons" not in v:
                problems.append(f"{where}: JSON-LD {key} off-site {v}")
    return s, title, desc, robots, blocks

# ---- key pages
KEY = ["/", "/de/", "/ranking/", "/de/ranking/", "/routes/", "/de/strecken/", "/change/", "/de/umsteigen/", "/compensation/", "/de/entschaedigung/",
       "/recap/", "/de/rueckblick/", "/network/", "/de/netz/", "/method/", "/de/methode/",
       "/route/hamburg-hbf-berlin-hbf/", "/de/strecke/hamburg-hbf-berlin-hbf/", "/train/ice-1541/", "/de/zug/ice-1541/"]
for p in KEY:
    check_page(p)

# types per page
s, *_rest = check_page("/")
b = ld_blocks(s)
types = collections.Counter(n.get("@type") for n in nodes(b))
for need in ("Organization", "WebSite", "Dataset", "WebPage"):
    if types[need] != 1: problems.append(f"/: expected one {need}, got {types[need]}")
home_ld = [n for n in nodes(b) if n.get("@type") == "BreadcrumbList"]
if home_ld and len(home_ld[0]["itemListElement"]) != 1: problems.append("/: home breadcrumb should be one item")

for p, kind in (("/method/", "FAQPage"), ("/de/methode/", "FAQPage"), ("/ranking/", "CollectionPage"), ("/routes/", "CollectionPage")):
    s, *_ = check_page(p)
    ks = [n.get("@type") for n in nodes(ld_blocks(s))]
    if kind not in ks: problems.append(f"{p}: expected {kind}, got {ks}")
s, *_ = check_page("/method/")
faq = [n for n in nodes(ld_blocks(s)) if n.get("@type") == "FAQPage"][0]
qs = [q["name"] for q in faq["mainEntity"]]
visible = re.findall(r'<summary[^>]*><span>(.*?)</span>', s)
visible = [html.unescape(re.sub(r"<[^>]+>", "", v)) for v in visible]
if qs != visible: problems.append(f"/method/: FAQ questions differ from visible ones: {set(qs) ^ set(visible)}")

s, *_ = check_page("/route/hamburg-hbf-berlin-hbf/")
bc = [n for n in nodes(ld_blocks(s)) if n.get("@type") == "BreadcrumbList"][0]
if [i["name"] for i in bc["itemListElement"]][:3] != ["Zugmonitor", "Rankings", "Routes, ranked"]: problems.append(f"route breadcrumb: {[i['name'] for i in bc['itemListElement']]}")

# titles for the three families
for p, rx in (("/train/ice-1541/", r"^ICE 1541 delays: [\d.]+% of trips 15\+ min late · Zugmonitor$"),
              ("/route/hamburg-hbf-berlin-hbf/", r"^Hamburg Hbf → Berlin Hbf train delays: [\d.]+% of trips 15\+ min late · Zugmonitor$"),
              ("/de/zug/ice-1541/", r"^ICE 1541 Verspätung: [\d,]+\u00a0% der Fahrten mind\. 15\u00a0Min\. zu spät · Zugmonitor$")):
    _, title, *_ = check_page(p)
    if not re.search(rx, title or ""): problems.append(f"{p}: unexpected title {title!r}")
line_dirs = sorted(os.listdir(os.path.join(out, "line")))
line_dirs = [d for d in line_dirs if os.path.isdir(os.path.join(out, "line", d))]
_, lt, *_ = check_page(f"/line/{line_dirs[0]}/")
if " – " not in (lt or ""): problems.append(f"line title lacks route: {lt}")

# more page: noindex
s = read(page_path("/more/"))
if 'name="robots" content="noindex' not in s: problems.append("/more/ is not noindex")

# ---- text files
for f, must in (("robots.txt", ["Sitemap: " + SITE + "/sitemap.xml", "User-Agent: GPTBot", "User-Agent: *", "Disallow: /api/"]),
                ("llms.txt", ["# Zugmonitor", "## Pages", SITE + "/route/", "llms-full.txt"]),
                ("llms-full.txt", ["### Where does the data come from?", "## The 25 most delayed routes", "Licence"])):
    p = os.path.join(out, f)
    if not os.path.exists(p): problems.append(f"missing {f}"); continue
    t = open(p, encoding="utf8").read()
    for m in must:
        if m not in t: problems.append(f"{f}: missing {m!r}")
    if re.search(r"\{[a-zA-Z0-9_]+\}", t): problems.append(f"{f}: unfilled placeholder")
    if "german-punctuality" in t.lower(): problems.append(f"{f}: old brand")
    print(f"{f}: {len(t)} bytes")
# every URL in llms.txt resolves to a built page
for u in re.findall(r"\]\((https://zugmonitor\.de[^)\s]*)\)", read("llms.txt") + read("llms-full.txt")):
    path = u[len(SITE):]
    if path.endswith(".txt"):
        ok = os.path.exists(os.path.join(out, path.strip("/")))
    else:
        ok = os.path.exists(os.path.join(out, page_path(path)))
    if not ok: problems.append(f"llms link not built: {u}")

# sitemap
sm = read("sitemap.xml")
locs = re.findall(r"<loc>([^<]+)</loc>", sm)
if any(not l.startswith(SITE) for l in locs): problems.append("sitemap has off-site URL")
if any("/more/" in l or "/mehr/" in l for l in locs): problems.append("sitemap lists /more/")
print("sitemap URLs:", len(locs))

# ---- all pages
if ALL:
    n = 0
    for l in locs:
        path = l[len(SITE):]
        try:
            check_page(path, strict=False)
        except FileNotFoundError:
            problems.append(f"sitemap URL not built: {path}")
        n += 1
    print("checked pages:", n)

print("notes:", len(notes))
for x in notes[:15]: print("  note:", x)
print("problems:", len(problems))
for x in problems[:60]: print("  PROBLEM:", x)
sys.exit(1 if problems else 0)
