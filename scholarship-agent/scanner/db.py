"""SQLite store (FR-B1..B9)."""
import json, shutil, sqlite3
from datetime import date
from pathlib import Path
from . import regions

SCHEMA_VERSION = 2
STIPEND_TYPES = ("full funding", "tuition waiver", "stipend only", "partial award",
                 "travel or research grant", "other", "not stated")
USER_MARKS = ("saved", "applied", "dismissed")

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sources(
  url TEXT PRIMARY KEY, name TEXT, country TEXT, kind TEXT, level TEXT,
  enabled INTEGER DEFAULT 1, auto_added INTEGER DEFAULT 0, added_on TEXT, reason TEXT,
  discovered_from TEXT, fail_count INTEGER DEFAULT 0, hash TEXT, checked TEXT,
  needs_browser INTEGER DEFAULT 0, removed INTEGER DEFAULT 0, verified INTEGER DEFAULT 0,
  succeeded_once INTEGER DEFAULT 0, last_text TEXT);
CREATE TABLE IF NOT EXISTS opportunities(
  id TEXT PRIMARY KEY, name TEXT, provider TEXT, university TEXT,
  countries TEXT, uk_nation TEXT, language TEXT, topics TEXT, level TEXT,
  stipend_type TEXT, value REAL, currency TEXT, opens TEXT, deadline TEXT,
  deadline_approx INTEGER DEFAULT 0, deadline_text TEXT, entry_year INTEGER,
  eligibility TEXT, eligibility_reason TEXT, contact TEXT, source_urls TEXT, quote TEXT,
  first_seen TEXT, last_seen TEXT, last_checked TEXT, status TEXT,
  user_mark TEXT, note TEXT, ai_generated INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, opp_id TEXT, field TEXT, old TEXT, new TEXT, changed_on TEXT);
CREATE TABLE IF NOT EXISTS rejected_candidates(
  url TEXT PRIMARY KEY, reason TEXT, discovered_from TEXT, on_date TEXT);
"""
JSON_FIELDS = ("countries", "topics", "source_urls")
TRACKED = ("deadline", "deadline_text", "value", "currency", "stipend_type", "eligibility", "entry_year", "opens")

class Db:
    def __init__(self, path, today=None, backup=True):
        self.path = Path(path)
        self.today = today or str(date.today())
        if backup and self.path.exists() and self.path.stat().st_size:
            shutil.copy(self.path, self.path.with_suffix(".db.bak"))
        self.c = sqlite3.connect(self.path)
        self.c.row_factory = sqlite3.Row
        self._migrate()

    def _migrate(self):
        self.c.executescript(SCHEMA)
        row = self.c.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
        version = int(row[0]) if row else 0
        if version == 1:  # v1 had a single 'country' text column
            cols = {r[1] for r in self.c.execute("PRAGMA table_info(opportunities)")}
            if "country" in cols and "countries" not in cols:
                self.c.execute("ALTER TABLE opportunities ADD COLUMN countries TEXT")
                self.c.execute("UPDATE opportunities SET countries='[\"'||country||'\"]'")
        self.c.execute("INSERT OR REPLACE INTO meta VALUES('schema_version',?)", (str(SCHEMA_VERSION),))
        self.c.commit()

    def version(self):
        return int(self.c.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0])

    # ---- opportunities
    def _row(self, r):
        d = dict(r)
        for f in JSON_FIELDS: d[f] = json.loads(d[f]) if d.get(f) else []
        d["region_group"] = regions.region_group(d["countries"])
        d["status"] = self.status_of(d)
        return d

    def status_of(self, d):
        if d.get("deadline") and d["deadline"] < self.today: return "closed"
        if d.get("opens") and d["opens"] > self.today: return "upcoming"
        if d.get("deadline"): return "open"
        return "unknown"

    def get(self, opp_id):
        r = self.c.execute("SELECT * FROM opportunities WHERE id=?", (opp_id,)).fetchone()
        return self._row(r) if r else None

    def all(self):
        return [self._row(r) for r in self.c.execute("SELECT * FROM opportunities ORDER BY name")]

    def upsert(self, opp):
        """Insert or update. Returns 'new', 'changed' or 'same'. Keeps user marks."""
        if opp["stipend_type"] not in STIPEND_TYPES: raise ValueError("bad stipend type")
        cur = self.get(opp["id"])
        row = dict(opp)
        row["last_seen"] = row["last_checked"] = self.today
        if cur is None:
            row["first_seen"] = self.today
            row.setdefault("user_mark", None); row.setdefault("note", None)
            self._write(row, insert=True)
            return "new"
        urls = sorted(set(cur["source_urls"]) | set(row["source_urls"]))
        row["source_urls"] = urls
        row["first_seen"] = cur["first_seen"]
        row["user_mark"], row["note"] = cur["user_mark"], cur["note"]
        changed = False
        for f in TRACKED:
            if cur.get(f) != row.get(f) and row.get(f) is not None:
                self.c.execute("INSERT INTO history(opp_id,field,old,new,changed_on) VALUES(?,?,?,?,?)",
                               (opp["id"], f, str(cur.get(f)), str(row.get(f)), self.today))
                changed = True
        for f in ("countries",):
            row[f] = sorted(set(cur[f]) | set(row[f]))
        self._write(row, insert=False)
        return "changed" if changed else "same"

    def _write(self, row, insert):
        cols = [r[1] for r in self.c.execute("PRAGMA table_info(opportunities)") if r[1] != "country"]
        vals = {}
        for k in cols:
            v = row.get(k)
            vals[k] = json.dumps(v) if k in JSON_FIELDS else v
        vals["status"] = self.status_of(row)
        q = "INSERT OR REPLACE INTO opportunities(%s) VALUES(%s)" % (",".join(vals), ",".join("?" * len(vals)))
        self.c.execute(q, list(vals.values()))
        self.c.commit()

    def history(self, opp_id):
        return [dict(r) for r in self.c.execute("SELECT * FROM history WHERE opp_id=? ORDER BY id", (opp_id,))]

    def mark(self, opp_id, mark, note=None):
        if mark not in USER_MARKS + (None,): raise ValueError("mark must be one of %s" % (USER_MARKS,))
        self.c.execute("UPDATE opportunities SET user_mark=?, note=COALESCE(?,note) WHERE id=?", (mark, note, opp_id))
        self.c.commit()

    def refresh_status(self):
        for d in self.all():
            self.c.execute("UPDATE opportunities SET status=? WHERE id=?", (d["status"], d["id"]))
        self.c.commit()

    # ---- sources
    def source(self, url):
        r = self.c.execute("SELECT * FROM sources WHERE url=?", (url,)).fetchone()
        return dict(r) if r else None

    def sources(self, enabled_only=True):
        q = "SELECT * FROM sources WHERE removed=0" + (" AND enabled=1" if enabled_only else "")
        return [dict(r) for r in self.c.execute(q + " ORDER BY url")]

    def add_source(self, url, name, country, kind="university", level="both", **kw):
        if self.source(url): return False
        self.c.execute("""INSERT INTO sources(url,name,country,kind,level,enabled,auto_added,added_on,reason,
                          discovered_from,verified) VALUES(?,?,?,?,?,1,?,?,?,?,?)""",
                       (url, name, country, kind, level, int(kw.get("auto_added", 0)), self.today,
                        kw.get("reason"), kw.get("discovered_from"), int(kw.get("verified", 0))))
        self.c.commit(); return True

    def update_source(self, url, **kw):
        sets = ",".join("%s=?" % k for k in kw)
        self.c.execute("UPDATE sources SET %s WHERE url=?" % sets, list(kw.values()) + [url]); self.c.commit()

    def remove_source(self, url):
        """Remove or disable; stays in the table so auto-discovery does not re-add it (TC-S9)."""
        self.c.execute("UPDATE sources SET removed=1, enabled=0 WHERE url=?", (url,)); self.c.commit()

    def reject(self, url, reason, discovered_from):
        self.c.execute("INSERT OR REPLACE INTO rejected_candidates VALUES(?,?,?,?)",
                       (url, reason, discovered_from, self.today)); self.c.commit()

    def rejected(self):
        return [dict(r) for r in self.c.execute("SELECT * FROM rejected_candidates")]

    def close(self): self.c.close()
