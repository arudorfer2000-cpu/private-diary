"""Rule-based eligibility label (FR-E3, E4, E5, E9). 'unclear' beats guessing."""
import re
from . import regions

ADJ = {"Austria": "Austrian", "Spain": "Spanish"}

NOT_UK_HOME = re.compile(r"(?:\bUK (?:and Irish )?(?:home )?(?:students?|residents?|citizens?|nationals?|applicants?)\b[^.]{0,20}\bonly\b|"
                         r"(?:open|available|restricted)\s+(?:only\s+)?to\s+(?:UK|home)\b|\bhome (?:fee )?students?\b[^.]{0,20}\bonly\b|"
                         r"\bfor (?:UK|home) (?:fee )?students?\b|\bUK home students\b)", re.I)
NON_EU_ONLY = re.compile(r"(?:non-?EU|outside (?:of )?the (?:EU|European Union)|non-European)[^.]{0,40}\b(?:only|applicants|students)\b|"
                         r"\bonly\b[^.]{0,30}(?:non-?EU|outside (?:of )?the EU)", re.I)
OTHER_GROUP = re.compile(r"\b(?:refugees?|forcibly displaced|asylum|Commonwealth (?:citizens|countries|students)|"
                         r"developing countr\w+|students from (?:Africa|Asia|Latin America|the Middle East)|"
                         r"citizens of (?:Africa|Asia))\b", re.I)
POSITIVE = re.compile(r"\b(?:international (?:and EU )?(?:students?|applicants?)|EU (?:students?|citizens?|nationals?|applicants?)|"
                      r"(?:UK|home) and (?:EU|international)|EU and international|all nationalities|any nationality|"
                      r"regardless of nationality|open to all (?:nationalities|applicants)|applicants of all nationalities)\b", re.I)

def _sentence(text, m):
    s = text.rfind("\n", 0, m.start()) + 1
    e = text.find("\n", m.end()); e = len(text) if e < 0 else e
    return text[s:e][:300]

def classify(text, profile, entry_year=None):
    """Returns (label, reason, quote). label in eligible / not eligible / unclear / other year."""
    want = int(profile.get("entry_year", 2027))
    if entry_year and entry_year != want and str(want) not in text:
        return "other year", f"page is for {entry_year} entry", ""
    if not regions.is_eu_citizen(profile.get("citizenships", [])): eu_user = False
    else: eu_user = True
    uk_user = any(c in ("United Kingdom", "UK", "GB") for c in profile.get("citizenships", []))
    m = NOT_UK_HOME.search(text)
    if m and uk_user:
        return "eligible", "open to UK Home students", _sentence(text, m)
    if m and not POSITIVE.search(text):
        return "not eligible", "UK Home students only", _sentence(text, m)
    m = NON_EU_ONLY.search(text)
    if m and eu_user:
        return "not eligible", "non-EU applicants only", _sentence(text, m)
    m = OTHER_GROUP.search(text)
    if m and not POSITIVE.search(text):
        return "not eligible", f"restricted group: {m.group(0).lower()}", _sentence(text, m)
    for c in profile.get("citizenships", []):
        for word in (c, ADJ.get(c, c)):
            m = re.search(r"\b%s\b" % re.escape(word), text)
            if m and re.search(r"citizen|national|student|applicant", text[max(0, m.start()-60):m.end()+60], re.I):
                return "eligible", f"your citizenship ({c}) is named", _sentence(text, m)
    m = POSITIVE.search(text)
    if m:
        if m.group(0).lower().startswith("eu") and not eu_user:
            return "unclear", "open to EU citizens; your status is not EU", _sentence(text, m)
        return "eligible", "open to international or EU applicants", _sentence(text, m)
    return "unclear", "page does not state who can apply", ""
