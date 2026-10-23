"""One scan run: fetch -> extract -> database -> digest -> viewer -> email."""
import hashlib, json, re
from datetime import date
from pathlib import Path
from . import ai, digest, discover, extract, mailer, viewer
from .db import Db
from .fetch import Fetcher, FetchError

NOISE = re.compile(r"cookie|copyright|©|all rights reserved|privacy|accept all|last updated|\bpage updated\b", re.I)

def fingerprint(text):
    lines = [l for l in text.splitlines() if not NOISE.search(l)]
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()

def seed(db, sources):
    for s in sources:
        db.add_source(s["url"], s["name"], s["country"], kind=s.get("kind", "university"), level=s.get("level", "both"), verified=0)

def run(base, cfg, sources, fetcher=None, today=None, env=None, smtp_factory=None, only=None, send=True, ai_opener=None):
    base = Path(base); today = today or str(date.today())
    profile = cfg["profile"]; enabled = set(profile.get("countries", []))
    db = Db(base / cfg.get("database", "scholarships.db"), today=today)
    seed(db, sources)
    fetcher = fetcher or Fetcher(delay_s=cfg.get("delay_s", 3.0))
    new, changed, failed, added_sources, ai_notes = [], [], [], [], {}
    first_check = set()
    checked = 0
    budget = discover.MAX_NEW_PER_RUN
    for src in db.sources():
        if only and src["url"] != only: continue
        if src["country"] not in enabled:
            continue
        checked += 1
        try:
            page = fetcher.fetch(src["url"], needs_browser=bool(src["needs_browser"]))
        except FetchError as e:
            n = src["fail_count"] + 1
            db.update_source(src["url"], fail_count=n)
            why = e.args[0] + (" – possibly moved (failed %d runs in a row)" % n if n >= 3 else "")
            failed.append((src["name"], src["url"], why)); continue
        except Exception as e:
            failed.append((src["name"], src["url"], "error: %s" % type(e).__name__)); continue
        auto_first = src["auto_added"] and not src["succeeded_once"]
        h = fingerprint(page.text)
        db.update_source(src["url"], fail_count=0, succeeded_once=1, checked=today,
                         needs_browser=int(src["needs_browser"] or page.rendered))
        if h != src["hash"]:
            db.update_source(src["url"], hash=h)
            opp = extract.extract(page, src, profile, today)
            if opp:
                result = db.upsert(opp)
                if auto_first: first_check.add(opp["id"])
                if result in ("new", "changed"):
                    row = db.get(opp["id"])
                    if row["user_mark"] in ("applied", "dismissed"): continue      # FR-D4: marked items stay quiet
                    row["changes"] = [h for h in db.history(opp["id"]) if h["changed_on"] == today]
                    (new if result == "new" else changed).append(row)
                    note = ai.summarise(opp, page.text, profile, env=env, **({'opener': ai_opener} if ai_opener else {}))
                    if note:
                        ai_notes[opp["id"]] = note
                        db.c.execute("UPDATE opportunities SET ai_generated=1 WHERE id=?", (opp["id"],)); db.c.commit()
        if budget > 0:
            got, _ = discover.discover(db, page, src, fetcher, enabled, today_cap=budget)
            budget -= len(got); added_sources += got
    db.refresh_status()
    text, urgent = digest.build(today, new, changed, failed, checked, added_sources, profile, ai_notes,
                                cfg.get("viewer_url"))
    urgent = [o for o in urgent if o["id"] not in first_check]
    out_dir = base / cfg.get("output_dir", "output"); out_dir.mkdir(exist_ok=True)
    path = digest.write(out_dir, text, today)
    viewer.write(db, out_dir / "viewer.html", today, today)
    mail = "not sent"
    if send and (new or changed):
        subject = ("URGENT: " if urgent else "") + f"Scholarship digest {today}: {len(new)} new, {len(changed)} changed"
        ok, msg = mailer.send(cfg.get("email", {}), subject, text, env=env,
                              **({"smtp_factory": smtp_factory} if smtp_factory else {}))
        mail = msg
    db.close()
    return {"digest": path, "new": new, "changed": changed, "failed": failed, "urgent": urgent,
            "added_sources": added_sources, "email": mail, "subject_urgent": bool(urgent)}
