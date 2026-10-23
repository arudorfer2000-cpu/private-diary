"""Rule-based extraction of one opportunity per page (FR-E1, E2, E6, E7, B3, B4)."""
import hashlib, re
from datetime import date
from . import eligibility

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
MON = "(" + "|".join(m[:3] + "[a-z]*" for m in MONTHS) + ")"
D_DMY = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?" + MON + r"\.?,?\s+(20\d\d)\b", re.I)
D_MDY = re.compile(r"\b" + MON + r"\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b", re.I)
D_ISO = re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b")
D_NUM = re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b")
MONTH_ONLY = re.compile(r"\b(?:clos\w*|deadline\w*|apply by|applications? (?:must|close)\w*)\W{0,12}(?:is |will be |:)?\s*(?:in |by |on )?" + MON + r"(?:\s+(20\d\d))?\b", re.I)
DEADLINE_WORDS = re.compile(r"deadline|clos(?:e|es|ing|ed)|apply by|submit(?:ted)? by|last date|no later than", re.I)
OPEN_WORDS = re.compile(r"\bopen(?:s|ing)?\b", re.I)
MONEY = re.compile(r"(£|€|GBP\s?|EUR\s?|SEK\s?|\bkr\.?\s?)\s?(\d{1,3}(?:[,. ]\d{3})+|\d+)(?:\.\d+)?\s?(k\b)?", re.I)
CUR = {"£": "GBP", "gbp": "GBP", "€": "EUR", "eur": "EUR", "sek": "SEK", "kr": "SEK", "kr.": "SEK"}
FUND = re.compile(r"scholarship|studentship|bursar|fellowship|stipend|funding|funded|fee waiver|tuition waiver|grant\b|award", re.I)
LANGS = {"dutch": "Dutch", "german": "German", "french": "French", "italian": "Italian", "spanish": "Spanish",
         "portuguese": "Portuguese", "swedish": "Swedish", "flemish": "Dutch"}
GENERIC_LOCAL = re.compile(r"^(info|admissions?|graduate|postgrad\w*|pgr|pgt|enquir\w+|scholarships?|funding|studentships?|"
                           r"international|study|apply|contact|office|registry|student\w*|masters?|phd|research|doctoral|"
                           r"finance|bursar\w*|awards?)([._-]|$)", re.I)
BAD_NAMES = {"fees and funding", "scholarships", "funding", "postgraduate funding", "home"}

def norm(s): return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def _iso(y, m, d):
    try: return str(date(int(y), int(m), int(d)))
    except ValueError: return None

def _month(name): return [i for i, m in enumerate(MONTHS, 1) if m.startswith(name[:3].lower())][0]

def find_dates(line):
    out = []
    for m in D_DMY.finditer(line): out.append((m.start(), _iso(m.group(3), _month(m.group(2)), m.group(1))))
    for m in D_MDY.finditer(line): out.append((m.start(), _iso(m.group(3), _month(m.group(1)), m.group(2))))
    for m in D_ISO.finditer(line): out.append((m.start(), _iso(*m.groups())))
    for m in D_NUM.finditer(line): out.append((m.start(), _iso(m.group(3), m.group(2), m.group(1))))  # day first
    return [(p, d) for p, d in sorted(out) if d]

lines = {}  # iso deadline -> page line it came from (verbatim quote)

def deadlines(text, today):
    dl, opens, approx = [], [], None
    lines.clear()
    for line in text.splitlines():
        for pos, iso in find_dates(line):
            ctx = line[max(0, pos - 80):pos + 20]
            if DEADLINE_WORDS.search(ctx): dl.append(iso); lines.setdefault(iso, line)
            elif OPEN_WORDS.search(ctx): opens.append(iso)
        if not dl:
            m = MONTH_ONLY.search(line)
            if m and not find_dates(line): approx = m.group(1).capitalize() + (f" {m.group(2)}" if m.group(2) else "")
    chosen = None
    if dl:
        future = sorted(d for d in dl if d >= today)
        chosen = future[0] if future else max(dl)
    return chosen, (min(opens) if opens else None), approx

def money(text):
    best = None
    for m in MONEY.finditer(text):
        digits = re.sub(r"[,. ]", "", m.group(2)); n = float(digits)
        if m.group(3): n *= 1000
        if n < 100: continue
        cur = CUR.get(m.group(1).strip().lower(), "EUR")
        if best is None or n > best[0]: best = (n, cur)
    return best or (None, None)

def stipend_type(t):
    low = t.lower()
    tuition = bool(re.search(r"tuition|fees?\b", low)); stip = bool(re.search(r"stipend|maintenance|living (?:costs|allowance)", low))
    if re.search(r"fully[- ]funded|full funding|full scholarship|full cost|full award", low) or (tuition and stip): return "full funding"
    if re.search(r"(tuition|fee)s? (?:waiver|reduction|discount|remission)|waiver of|fee waiver", low): return "tuition waiver"
    if stip: return "stipend only"
    if re.search(r"travel (?:grant|award)|research (?:grant|expenses|costs)", low): return "travel or research grant"
    if re.search(r"partial|contribution|bursary|towards", low): return "partial award"
    return "not stated"

def level_of(t, fallback):
    low = t.lower()
    ma = bool(re.search(r"\bmaster|\bmsc\b|\bma\b|\bmphil\b|taught", low)); ph = bool(re.search(r"\bph\.?d|doctora|studentship|dphil", low))
    if ma and ph: return "both"
    return "masters" if ma else "phd" if ph else fallback

def topics_of(t):
    low = t.lower(); out = []
    if re.search(r"art history|history of art|art-historical|curatorial", low): out.append("art history")
    if re.search(r"\beconomic|econometric", low): out.append("economics")
    if re.search(r"arts? management|cultural management|cultural policy|arts administration|museum|heritage management|creative industries", low): out.append("arts management")
    return out or ["other"]

def language_of(t):
    low = t.lower(); eng = bool(re.search(r"taught in english|english[- ]taught|english[- ]language (?:programme|program|course)|in english", low))
    loc = [LANGS[k] for k in LANGS if re.search(r"taught in %s|%s[- ]taught|in %s\b" % (k, k, k), low)]
    if eng and loc: return "both"
    if eng: return "English"
    if loc: return "local language"
    return "not stated"

def entry_year_of(t):
    ys = []
    for m in re.finditer(r"(?:entry|intake|start|commenc\w+|admission|enrol\w+|academic year|studies begin)\D{0,40}?(20\d\d)", t, re.I): ys.append(int(m.group(1)))
    for m in re.finditer(r"\b(20\d\d)(?:[/-]\d{2,4})?\s+(?:entry|intake|cohort|academic year)", t, re.I): ys.append(int(m.group(1)))
    return 2027 if 2027 in ys else (min(ys) if ys else None)

def contact_of(page):
    cands = []
    for href, anchor in page.links:
        if href.lower().startswith("mailto:"): cands.append(href[7:].split("?")[0])
    cands += re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", page.text)
    for e in cands:  # generic office addresses only; personal-looking ones are skipped (FR-B3)
        local = e.split("@")[0]
        if GENERIC_LOCAL.match(local): return e.lower()
    for href, anchor in page.links:
        if re.search(r"contact|enquir", anchor, re.I): return href
    return None

def clean_name(title, source_name):
    t = re.split(r"\s+[|–—-]\s+", title)[0].strip() if title else ""
    if not t or norm(t) in BAD_NAMES: t = (t + " – " if t else "") + source_name
    return t[:140]

def quote_of(text, picks):
    for line in text.splitlines():
        if any(p and p in line for p in picks) and len(line) > 20: return line[:300]
    for line in text.splitlines():
        if FUND.search(line) and len(line) > 30: return line[:300]
    return ""

def extract(page, source, profile, today):
    """Returns an opportunity dict, or None if the page is not about funding."""
    text = page.text
    if not FUND.search(text): return None
    dl, opens, approx = deadlines(text, today)
    val, cur = money(text)
    year = entry_year_of(text)
    label, reason, elig_quote = eligibility.classify(text, profile, year)
    university = source.get("university") or source["name"].split(" – ")[0].split(" - ")[0]
    name = clean_name(page.title, source["name"])
    picks = [p for p in (elig_quote[:60],) if p]
    opp = {
        "id": hashlib.sha1((norm(name) + "|" + norm(university)).encode()).hexdigest()[:12],
        "name": name, "provider": source["name"], "university": university,
        "countries": [source["country"]], "uk_nation": source.get("uk_nation"),
        "language": language_of(text), "topics": topics_of(text), "level": level_of(text, source.get("level", "both")),
        "stipend_type": stipend_type(text), "value": val, "currency": cur, "opens": opens, "deadline": dl,
        "deadline_approx": 1 if (approx and not dl) else 0, "deadline_text": approx if not dl else None,
        "entry_year": year, "eligibility": label, "eligibility_reason": reason, "contact": contact_of(page),
        "source_urls": [page.url], "quote": (lines.get(dl) or quote_of(text, ["£", "€"] + picks) or elig_quote)[:300],
        "ai_generated": 0, "user_mark": None, "note": None,
    }
    return opp
