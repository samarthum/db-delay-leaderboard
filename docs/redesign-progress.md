# Redesign: dark departure board, EN/DE (branch redesign-board)

Decisions (from the grill): purpose = "How late is your train, really?"; home = promise + one search box + one network line; result leads with the share of trips 15+ min late; deadpan tone; dark departure-board look; EN + DE; history only (no live status); mobile web first, desktop is the stretch; ranking/network/method on their own pages behind a tab bar.

Done (step 1): bilingual route trees (/ and /de/, separate root layouts via route groups, global-not-found), dictionary in lib/dict/{en,de} (scripts/check-dict.mjs verifies keys and placeholders), typeahead over trains, lines and stations (no model, public/search/ta.json, ~46 kB gzipped), new result card and train/line pages, dark share images in EN and DE, canvas "Save as image" card.
German copy: reviewed by two independent reviewer agents, all findings applied (glossary: mindestens 15 Minuten, im Schnitt, Fahrt, ausgefallen/Teilausfall, Median, ausgenommen).

Open / step 2: per-stop delay for long-distance trains (pipeline change) and natural-language route search ("8:14 Köln nach Berlin"); optional embedding fallback later. Station search today matches only a train's first and last stop.
Not done: real-phone test of Share / Save image; a second German read-through by a human if one becomes available; not pushed, not merged.
