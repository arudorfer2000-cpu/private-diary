"""Dated digest (FR-D1..D3, O3)."""
from datetime import date, datetime
from pathlib import Path

URGENT_DAYS = 30

def days_left(deadline, today):
    return (date.fromisoformat(deadline) - date.fromisoformat(today)).days if deadline else None

def sort_key(o, today):
    d = days_left(o.get("deadline"), today)
    return (d is None, d if d is not None else 0, o["name"])

def is_urgent(o, today):
    d = days_left(o.get("deadline"), today)
    return d is not None and 0 <= d <= URGENT_DAYS

def build(today, new, changed, failed, sources_checked, auto_added=(), profile=None, ai_notes=None, viewer_url=None):
    new = sorted(new, key=lambda o: sort_key(o, today)); changed = sorted(changed, key=lambda o: sort_key(o, today))
    urgent = [o for o in new + changed if is_urgent(o, today)]
    lines = [f"# Scholarship digest {today}", ""]
    if profile: lines += [f"Profile: {', '.join(profile.get('fields', []))} · entry {profile.get('entry_year')}", ""]
    lines += [f"**{len(new)} new · {len(changed)} changed · {len(failed)} could not be checked · {sources_checked} sources checked**"]
    if urgent: lines += ["", f"**Urgent (deadline within {URGENT_DAYS} days): " + "; ".join(o["name"] for o in urgent) + "**"]
    if viewer_url: lines += ["", f"Viewer: {viewer_url}"]
    for title, items in (("New", new), ("Changed", changed)):
        if not items: continue
        lines += ["", f"## {title}"]
        for o in items: lines += _item(o, today, ai_notes or {})
    if auto_added: lines += ["", "## Sources added automatically"] + [f"- {u}" for u in auto_added]
    if failed: lines += ["", "## Could not be checked"] + [f"- {n} ({u}): {why}" for n, u, why in failed]
    lines += ["", "_Dates, amounts and eligibility are read from the pages by rules and may be wrong. Confirm on the official page before applying._"]
    return "\n".join(lines) + "\n", urgent

def _item(o, today, ai_notes):
    d = days_left(o.get("deadline"), today)
    dl = o.get("deadline") or (f"{o['deadline_text']} (approximate)" if o.get("deadline_text") else "not stated")
    if d is not None: dl += f" ({'closed' if d < 0 else f'{d} days left'})"
    val = f"{o['value']:,.0f} {o['currency']}" if o.get("value") else "not stated"
    region = "/".join(sorted({c for c in o["countries"]}))
    out = ["", f"### {o['name']}{'  ⚠ URGENT' if is_urgent(o, today) else ''}",
           f"{o['university']} · {region} · {o['level']} · {o['stipend_type']} · value {val}",
           f"Deadline: {dl} · Entry year: {o.get('entry_year') or 'not stated'} · Language: {o['language']}",
           f"Eligibility for you: **{o['eligibility']}** – {o['eligibility_reason']}",
           f"Contact: {o.get('contact') or 'not stated'} · Source: {o['source_urls'][0]} · checked {o['last_checked']}"]
    for h in o.get("changes", []): out.append(f"Changed: {h['field']} {h['old']} → {h['new']}")
    if o.get("quote"): out.append(f"> {o['quote']}")
    if ai_notes.get(o["id"]): out.append(f"AI-generated summary: {ai_notes[o['id']]}")
    return out

def write(folder, text, today, now=None):
    folder = Path(folder); p = folder / f"digest-{today}.md"
    if p.exists(): p = folder / f"digest-{today}-{(now or datetime.now()).strftime('%H%M%S')}.md"
    p.write_text(text, encoding="utf-8"); return p
