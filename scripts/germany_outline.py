#!/usr/bin/env python3
"""Write lib/germany.json, the simplified outline of Germany used by the station map.

Source: Natural Earth 1:50m admin-0 countries (public domain). Run once; the outline does not change.

  python scripts/germany_outline.py
"""
import json
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
TOLERANCE = 0.01  # degrees, about 1 km
OUT = Path(__file__).resolve().parent.parent / "lib" / "germany.json"


def simplify(points, tol):
    """Douglas-Peucker on [lon, lat] pairs."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
    far, far_i = 0.0, 0
    for i, (x, y) in enumerate(points[1:-1], 1):
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
        if d > far:
            far, far_i = d, i
    if far <= tol:
        return [points[0], points[-1]]
    return simplify(points[: far_i + 1], tol)[:-1] + simplify(points[far_i:], tol)


def main():
    with urllib.request.urlopen(SOURCE, timeout=60) as resp:
        countries = json.load(resp)
    de = next(f for f in countries["features"] if f["properties"]["ADM0_A3"] == "DEU")["geometry"]
    polygons = de["coordinates"] if de["type"] == "MultiPolygon" else [de["coordinates"]]
    rings = []
    for polygon in polygons:
        # A closed ring starts and ends on the same point, so split it at the point farthest from the start.
        pts = polygon[0]
        x0, y0 = pts[0]
        k = max(range(len(pts)), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
        ring = simplify(pts[: k + 1], TOLERANCE)[:-1] + simplify(pts[k:], TOLERANCE)
        if len(ring) >= 4:
            rings.append([[round(x, 3), round(y, 3)] for x, y in ring])
    OUT.write_text(json.dumps({"source": "Natural Earth 1:50m, public domain", "rings": rings}, separators=(",", ":")) + "\n")
    print(f"{OUT.name}: {len(rings)} rings, {sum(len(r) for r in rings)} points")


if __name__ == "__main__":
    main()
