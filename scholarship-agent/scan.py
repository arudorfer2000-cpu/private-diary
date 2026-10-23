#!/usr/bin/env python3
"""Scholarship scanner command line.

  python scan.py                  scan all sources, write digest + viewer, send email
  python scan.py --no-email       same without sending email
  python scan.py mark <id> saved|applied|dismissed [note]
  python scan.py remove-source <url>
  python scan.py list             list opportunities
"""
import json, sys
from pathlib import Path
from scanner import pipeline
from scanner.db import Db

HERE = Path(__file__).parent

def load():
    cfg = json.loads((HERE / "settings.json").read_text())
    sources = json.loads((HERE / "sources.json").read_text())["sources"]
    return cfg, sources

def main(argv):
    cfg, sources = load()
    if argv[:1] == ["mark"] and len(argv) >= 3:
        db = Db(HERE / cfg["database"]); db.mark(argv[1], None if argv[2] == "none" else argv[2], " ".join(argv[3:]) or None)
        print("ok"); return 0
    if argv[:1] == ["remove-source"] and len(argv) == 2:
        db = Db(HERE / cfg["database"]); db.remove_source(argv[1]); print("removed"); return 0
    if argv[:1] == ["list"]:
        for o in Db(HERE / cfg["database"], backup=False).all():
            print(o["id"], o["region_group"], o["deadline"] or "-", o["eligibility"], o["name"])
        return 0
    r = pipeline.run(HERE, cfg, sources, send="--no-email" not in argv)
    print(f"digest: {r['digest']}\nnew {len(r['new'])} · changed {len(r['changed'])} · failed {len(r['failed'])} · "
          f"sources added {len(r['added_sources'])} · email: {r['email']}")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
