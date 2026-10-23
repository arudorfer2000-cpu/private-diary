# Scholarship scanner

Checks university and funder pages in the UK and EU for scholarships, stores them in a database,
writes a dated digest, e-mails it, and exports a filterable `viewer.html`.
Start with `opportunities-2027.md` (hand-made list, unverified) and let the scanner keep things current.

## Run (on your own PC; the cloud workspace blocks university sites)
    python scan.py                 scan, write digest + viewer, send email
    python scan.py --no-email      same without email
    python scan.py list            list stored opportunities (id, UK/EU, deadline, eligibility, name)
    python scan.py mark <id> saved|applied|dismissed [note]     (use "none" to clear)
    python scan.py remove-source <url>
Needs Python 3.10+. Nothing else for the core. Output goes to `output/`: `digest-DATE.md` and `viewer.html`.

## Settings (`settings.json`)
- `profile`: citizenships, fields, entry year, and `countries` (ISO codes) to scan. Remove a code to switch a country off.
- `email`: set `enabled`, `user`, `to`. Password comes from the environment variable named in `password_env`
  (default `SCHOLAR_SMTP_PASSWORD`). Outlook/Hotmail: host `smtp-mail.outlook.com`, port 587, use an app password
  (needs two-step verification); Microsoft may block basic SMTP sign-in on some accounts.
  Windows: `setx SCHOLAR_SMTP_PASSWORD "your-app-password"`, then reopen the terminal.
- AI (optional): `setx ANTHROPIC_API_KEY "your-key"`. Key from console.anthropic.com → API Keys (needs a little prepaid credit).
  It only adds a short summary per new or changed item, marked "AI-generated". Without a key everything else works.
- `viewer_url`: the link of the published viewer; it is added to the digest and email.

## JavaScript-only pages
Optional: `pip install playwright` then `playwright install chromium`. The scanner switches a source to the browser
automatically when the plain page is nearly empty. Without Playwright such a source shows as "could not be checked" with the install command.

## Viewer
`output/viewer.html` opens by double-click (no server, no internet). Filters: UK / EU / both, country, topic, language of instruction,
level, stipend type, eligibility, entry year, status, your mark, deadline range, first-seen range, has contact, free text.
Publishing it as a private page is a separate step done in a Claude session after a real scan (the scanner cannot publish by itself).

## Schedule (Windows)
Task Scheduler → Create Basic Task → Weekly → program `python`, arguments `scan.py`, start in this folder.

## Tests
    python run_tests.py       51 Python tests (fake local web server, no real sites) + 36 viewer checks in headless Chromium
Results and what is not tested: `test-results.md`.

## Honest limits
- Dates, amounts and eligibility are read by rules and can be wrong; "unclear" or "not stated" means the page did not say. Confirm on the official page.
- One opportunity per page: a page listing ten scholarships becomes one entry.
- PDFs are not read. Many source URLs are best guesses; a wrong one shows under "could not be checked": fix it in `sources.json`.
- Auto-discovery adds at most 5 sources per run, only from the same website, and only if the page mentions funding and one of your fields.
