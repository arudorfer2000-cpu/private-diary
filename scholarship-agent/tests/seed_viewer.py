"""Builds fixture F13 (60 opportunities) and the exported viewer, plus expected filter counts computed in Python."""
import json, os, sys, tempfile
from datetime import date, timedelta
from scanner import db as dbm, regions, viewer

TODAY = "2026-10-23"
T = date.fromisoformat(TODAY)
COUNTRIES = [(["GB"], "England"), (["GB"], "Scotland"), (["IE"], None), (["AT"], None), (["ES"], None), (["FR"], None),
             (["NL"], None), (["SE"], None), (["PT"], None), (["GB", "AT"], None)]
TOPICS = [["art history"], ["economics"], ["arts management"], ["art history", "economics"], ["other"]]
LEVELS = ["masters", "phd", "both"]
STIP = list(dbm.STIPEND_TYPES)
LANG = ["English", "local language", "both", "not stated"]
ELIG = ["eligible", "not eligible", "unclear", "other year"]

def rows():
    out = []
    for i in range(60):
        c, nation = COUNTRIES[i % 10]
        dl = None if i % 7 == 0 else str(T + timedelta(days=(i * 9) % 200 - 20))
        out.append({"id": f"opp{i:03d}", "name": f"Opportunity {i:02d} {'Alpha' if i % 2 else 'Beta'}", "provider": "P", "university": f"Uni {i % 12}",
                    "countries": c, "uk_nation": nation, "language": LANG[i % 4], "topics": TOPICS[i % 5], "level": LEVELS[i % 3],
                    "stipend_type": STIP[i % len(STIP)], "value": None if i % 5 == 0 else 1000.0 * (i + 1), "currency": "GBP" if "GB" in c else "EUR",
                    "opens": None, "deadline": dl, "deadline_approx": 0, "deadline_text": None, "entry_year": 2027 if i % 6 else 2026,
                    "eligibility": ELIG[i % 4], "eligibility_reason": "reason", "contact": f"office{i}@uni.example" if i % 3 == 0 else None,
                    "source_urls": [f"https://uni{i % 12}.example/funding"], "quote": f"Quote for opportunity {i}", "ai_generated": 0,
                    "user_mark": ["saved", "applied", "dismissed", None][i % 4], "note": None})
    return out

def build(path_db, path_html, today=TODAY, last_run=TODAY):
    d = dbm.Db(path_db, today=today, backup=False)
    for r in rows():
        d.upsert(r)
        first = str(T - timedelta(days=(0 if r["id"][-1] in "05" else 20)))
        d.c.execute("UPDATE opportunities SET first_seen=?, last_checked=? WHERE id=?", (first, TODAY, r["id"]))
    d.c.commit(); d.refresh_status()
    viewer.write(d, path_html, today, last_run)
    all_ = d.all(); d.close()
    return all_

def expected(all_):
    def n(f): return sum(1 for o in all_ if f(o))
    ok = lambda o, w: regions.matches_filter(o["countries"], w)
    return {"total": len(all_),
            "UK": n(lambda o: ok(o, "UK")), "EU": n(lambda o: ok(o, "EU")),
            "topic:economics": n(lambda o: "economics" in o["topics"]),
            "country:AT": n(lambda o: "AT" in o["countries"]),
            "language:English": n(lambda o: o["language"] == "English"),
            "level:phd": n(lambda o: o["level"] in ("phd", "both")),
            "stipend:full funding": n(lambda o: o["stipend_type"] == "full funding"),
            "elig:eligible": n(lambda o: o["eligibility"] == "eligible"),
            "year:2027": n(lambda o: o["entry_year"] == 2027),
            "status:closed": n(lambda o: o["status"] == "closed"),
            "mark:applied": n(lambda o: o["user_mark"] == "applied"),
            "hasContact": n(lambda o: bool(o["contact"])),
            "deadline:2026-11-01..2026-12-31": n(lambda o: o["deadline"] and "2026-11-01" <= o["deadline"] <= "2026-12-31"),
            "firstseen>=2026-10-23": n(lambda o: o["first_seen"] >= "2026-10-23"),
            "search:alpha": n(lambda o: "alpha" in o["name"].lower()),
            "search:quote for opportunity 7": n(lambda o: "quote for opportunity 7" in o["quote"].lower()),
            "EU+topic:art history+elig:unclear": n(lambda o: ok(o, "EU") and "art history" in o["topics"] and o["eligibility"] == "unclear"),
            "EU+country:ES": n(lambda o: ok(o, "EU") and "ES" in o["countries"]),
            "closingsoon": n(lambda o: o["deadline"] and 0 <= (date.fromisoformat(o["deadline"]) - T).days <= 30)}

if __name__ == "__main__":
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    all_ = build(os.path.join(out, "f13.db"), os.path.join(out, "viewer.html"))
    build(os.path.join(out, "f13-old.db"), os.path.join(out, "viewer-old.html"), today="2026-10-01", last_run="2026-10-01")
    json.dump(expected(all_), open(os.path.join(out, "expected.json"), "w"), indent=1)
    print(json.dumps(expected(all_)))
