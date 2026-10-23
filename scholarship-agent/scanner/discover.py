"""Automatic source discovery with guardrails (FR-S4, S6, S7, F3, NFR-10)."""
import re
from urllib.parse import urlparse
from . import regions

MAX_NEW_PER_RUN = 5
HINT = re.compile(r"scholarship|studentship|bursar|funding|fee-?waiver|stipend|fellowship|financ|fees-and-funding|grants?\b", re.I)
BAD_URL = re.compile(r"login|signin|sign-in|log-in|account|register|checkout|basket|cart|password|/auth|\.(pdf|docx?|xlsx?|zip|jpg|png)$", re.I)
SKIP_SCHEMES = ("mailto:", "tel:", "javascript:")
RELEVANT = re.compile(r"art history|history of art|economics|econometrics|arts? management|cultural (?:management|policy|economics)|museum|"
                      r"humanities|social sciences|all subjects|any subject|all disciplines|all fields", re.I)

def _site(host):
    return ".".join(host.lower().split(".")[-3:]) if host.lower().endswith(".ac.uk") else ".".join(host.lower().split(".")[-2:])

def candidates(page):
    """Links on a tracked page that look like funding pages and may be added."""
    out, seen = [], set()
    for href, anchor in page.links:
        if href.lower().startswith(SKIP_SCHEMES): continue
        href = href.split("#")[0]
        if href in seen or href == page.url: continue
        seen.add(href)
        if HINT.search(href) or HINT.search(anchor): out.append((href, anchor))
    return out

def discover(db, page, source, fetcher, enabled_countries, today_cap=None):
    """Looks at candidate links on a tracked page; adds up to the cap, logs the rest. Returns (added, rejected)."""
    cap = MAX_NEW_PER_RUN if today_cap is None else today_cap
    added, rejected = [], []
    if source["country"] not in enabled_countries: return added, rejected
    host = _site(urlparse(page.url).netloc)
    for href, anchor in candidates(page):
        if db.source(href) or any(r["url"] == href for r in db.rejected()): continue
        u = urlparse(href)
        if u.scheme not in ("http", "https") or BAD_URL.search(href):
            db.reject(href, "login, form, file or non-web link", page.url); rejected.append(href); continue
        if _site(u.netloc) != host:
            db.reject(href, "other site", page.url); rejected.append(href); continue
        if len(added) >= cap: continue  # waits for the next run, not rejected
        try: sub = fetcher.fetch(href)
        except Exception as e:
            reason = getattr(e, "kind", "error")
            db.reject(href, f"could not check: {reason}", page.url); rejected.append(href); continue
        if not re.search(r"scholarship|studentship|bursar|funding|stipend|fellowship", sub.text, re.I) or not RELEVANT.search(sub.text):
            db.reject(href, "no funding or no matching field/level on the page", page.url); rejected.append(href); continue
        name = f"{source['name'].split(' – ')[0]} – {sub.title or anchor or 'funding page'}"[:140]
        db.add_source(href, name, source["country"], kind=source.get("kind", "university"), level=source.get("level", "both"),
                      auto_added=1, reason=f"link '{anchor or href}' on {page.url}", discovered_from=page.url)
        added.append(href)
    return added, rejected
