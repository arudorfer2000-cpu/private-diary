#!/usr/bin/env python3
"""Scholarship scanner: fetches the pages in sources.json, detects changes
since the last run and writes a dated digest (digest-YYYY-MM-DD.md).

Python 3 standard library only. If ANTHROPIC_API_KEY is set, each changed page
is summarised by Claude; otherwise an extractive summary (deadlines, amounts,
2027 mentions, eligibility lines) is used.
"""
import hashlib, json, os, re, sys, time, urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).parent
STATE = HERE / "state.json"
UA = "Mozilla/5.0 (compatible; ScholarshipScanner/1.0; personal use)"
DELAY_S = 3  # be polite to university servers

class Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header"}
    def __init__(self):
        super().__init__(); self.parts, self.depth = [], 0
    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP: self.depth += 1
    def handle_endtag(self, tag):
        if tag in self.SKIP and self.depth: self.depth -= 1
        if tag in ("p", "li", "br", "h1", "h2", "h3", "tr"): self.parts.append("\n")
    def handle_data(self, data):
        if not self.depth: self.parts.append(data)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
    p = Text(); p.feed(html)
    text = re.sub(r"[ \t]+", " ", "".join(p.parts))
    return "\n".join(l.strip() for l in text.splitlines() if l.strip())

MONEY = re.compile(r"(?:£|€|EUR\s?|GBP\s?)\s?\d[\d,\.]*(?:k)?", re.I)
DATE = re.compile(r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+20(?:26|27)\b", re.I)
KEYS = re.compile(r"2027|deadline|closing date|eligib|EU (?:student|national|applicant)|international", re.I)

def extract(text):
    lines = [l for l in text.splitlines() if KEYS.search(l) and 20 < len(l) < 400]
    return {"deadlines": sorted(set(DATE.findall(text)))[:8],
            "amounts": sorted(set(m.strip() for m in MONEY.findall(text)))[:8],
            "lines": lines[:8]}

def claude_summary(name, text, profile):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key: return None
    body = {"model": "claude-sonnet-5-5", "max_tokens": 500, "messages": [{"role": "user", "content":
        f"Profile: {json.dumps(profile)}\nSource: {name}\nPage text (may be truncated):\n{text[:12000]}\n\n"
        "Summarise in <=5 bullets only scholarships/funding relevant to this profile for autumn 2027 entry: "
        "name, value, deadline, whether Austrian/Spanish (EU) citizens are eligible. Say 'unclear' rather than guessing."}]}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", json.dumps(body).encode(),
        {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)["content"][0]["text"]
    except Exception as e:
        return f"(AI summary failed: {e})"

def main():
    cfg = json.loads((HERE / "sources.json").read_text())
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    first_run = not state
    out, errors = [], []
    for s in cfg["sources"]:
        url = s["url"]
        try:
            text = fetch(url)
        except Exception as e:
            errors.append(f"- {s['name']} ({url}): {e}"); time.sleep(DELAY_S); continue
        h = hashlib.sha256(text.encode()).hexdigest()
        prev = state.get(url, {}).get("hash")
        status = "NEW SOURCE" if prev is None else ("CHANGED" if prev != h else "unchanged")
        state[url] = {"hash": h, "checked": str(date.today()), "info": extract(text)}
        if status != "unchanged":
            info = state[url]["info"]
            summ = claude_summary(s["name"], text, cfg["profile"])
            block = [f"### {s['name']} — {status}", f"{s['region']} · {s['level']} · {url}"]
            if info["deadlines"]: block.append("Dates seen: " + "; ".join(info["deadlines"]))
            if info["amounts"]: block.append("Amounts seen: " + ", ".join(info["amounts"]))
            if summ: block.append(summ)
            else: block += [f"- {l}" for l in info["lines"]]
            out.append("\n".join(block))
        time.sleep(DELAY_S)
    if len(errors) < len(cfg["sources"]): STATE.write_text(json.dumps(state, indent=1))
    report = HERE / f"digest-{date.today()}.md"
    head = f"# Scholarship digest {date.today()}\n\nProfile: {', '.join(cfg['profile']['fields'])} · {cfg['profile']['entry']}\n"
    if first_run: head += "\nFirst run: everything is listed as new. Later runs show only changes.\n"
    body = "\n\n".join(out) or ("No changes since last run." if not errors else "Nothing could be checked (see below).")
    if errors: body += "\n\n## Could not fetch\n" + "\n".join(errors)
    report.write_text(head + "\n" + body + "\n")
    print(f"Wrote {report} ({len(out)} new/changed, {len(errors)} errors)")

if __name__ == "__main__":
    sys.exit(main())
