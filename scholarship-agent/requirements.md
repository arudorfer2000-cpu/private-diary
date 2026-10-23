# Scholarship Scanner – Requirements Specification
Version 0.2 · 2026-10-23 · Status: draft for review

Decisions from the review dialog: Master's and PhD both; digest file plus email; AI optional; JavaScript pages supported with a headless browser; new sources added automatically with guardrails; a SQLite database with a filterable viewer, published as a private page.

## 1. Purpose
A personal agent that regularly checks UK and Irish university pages and home-country funders, and tells one user about new or changed scholarships for **autumn 2027** entry. It reports only what the source pages say and never invents a deadline, amount or eligibility.

**Out of scope for v1:** applying on the user's behalf, multi-user accounts, a self-run server, a native mobile app, countries other than UK, Ireland, Austria and Spain, and legal or immigration advice.

## 2. User profile (default, editable)
Citizenships Austria and Spain · fields art history, economics, arts management · levels Master's and PhD · entry autumn 2027.

## 3. Functional requirements
Priority: **M** must, **S** should, **C** could. "Now" means the current build already does it, partly or fully.

### 3.1 Sources
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-S1 | Sources are listed in one config file (name, URL, level, region); adding a source needs no code change. | M | yes |
| FR-S2 | Sources cover public and private universities in the UK and Ireland, plus national funders (AHRC, Irish Research Council) and home-country funders in Austria and Spain. | M | partial (23 sources) |
| FR-S3 | Each source can be tagged with the fields it covers, so irrelevant departments can be skipped. | S | no |
| FR-S4 | The agent discovers new universities and funders (UK and Ireland university lists, funder directories, links found on tracked pages) and starts tracking them automatically, within the guardrails of FR-S6. | M | no |
| FR-S5 | A source can be disabled without deleting it. | S | no |
| FR-S6 | Guardrails for auto-added sources: at most 5 new per run; each must pass a relevance check (mentions scholarship or funding and matches the user's fields or regions) or it goes to a "rejected candidates" log; each is marked "auto-added" with date, reason and discovery page; the user can remove or disable one in one step; auto-added sources never trigger an urgent email until a first successful check. | M | no |
| FR-S7 | Only public pages on the same site as the discovery page or on a known funder domain are added; no login pages or forms. | M | no |

### 3.2 Fetching
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-F1 | The agent fetches each source over HTTPS and reduces the page to plain text (no scripts, menus, footers). | M | yes |
| FR-F2 | It waits between requests and uses an identifying User-Agent. | M | yes (3 s) |
| FR-F3 | It honours robots.txt and skips disallowed pages with a note. | M | no |
| FR-F4 | A failed source (timeout, HTTP error, DNS) is recorded in the digest and does not stop the run. | M | yes |
| FR-F5 | Linked PDFs (call documents, guidance notes) are fetched and read. | S | no |
| FR-F6 | Pages that need JavaScript are fetched through a headless browser (Playwright). The agent tries a plain fetch first and switches a source to the browser when the text is nearly empty. | M | no |
| FR-F7 | A source that fails 3 runs in a row is flagged as "possibly moved". | S | no |

### 3.3 Change detection
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-C1 | The agent stores a fingerprint of each page and reports a source as NEW, CHANGED or unchanged. | M | yes |
| FR-C2 | Changes in navigation, dates in footers, cookie banners and similar noise do not trigger a CHANGED report. | S | partial |
| FR-C3 | For a CHANGED page, the digest shows what was added or removed, not only that it changed. | S | no |
| FR-C4 | State is not overwritten when every source failed (so a network outage does not reset history). | M | yes |
| FR-C5 | Each source keeps a history of its last N states. | C | no |

### 3.4 Extraction and matching
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-E1 | The agent extracts, for each scholarship: name, provider, level, value, deadline(s), start date, eligibility, and the source URL. | M | partial (dates, amounts, lines) |
| FR-E2 | Any field the page does not state is shown as "not stated", never guessed. | M | partial |
| FR-E3 | The agent judges eligibility against the profile (nationality, level, field, entry year) and labels it: eligible, not eligible, unclear. | M | no |
| FR-E4 | It recognises Home/EU/international fee categories and flags awards limited to UK Home students or to other nationalities. | M | no |
| FR-E5 | It flags awards for a different entry year than 2027 as "other year". | M | no |
| FR-E6 | Every extracted fact links back to the quoted text it came from. | S | no |
| FR-E7 | Deadlines are normalised to ISO dates; ambiguous ones ("January") are kept as text with an "approximate" mark. | S | no |

### 3.5 Digest and output
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-D1 | Each run writes a dated digest listing new and changed items. | M | yes |
| FR-D2 | Items are sorted by nearest deadline; items expiring within 30 days are marked urgent. | M | no |
| FR-D3 | The digest begins with a summary: counts of new, changed, failed. | S | no |
| FR-D4 | Items the user marked as dismissed or applied do not reappear. | S | no |
| FR-D5 | A master list of all known opportunities is kept and regenerated, with status (open, closed, upcoming, unknown). | M | no (list written by hand) |
| FR-D6 | The user can export the master list as CSV and as a calendar file of deadlines. | C | no |
| FR-D7 | After each run the digest is sent by email (SMTP settings in the config, password from an environment variable). Nothing is sent when there is nothing new or changed; urgent items go in the subject line. | M | no |
| FR-D8 | The email contains the digest as readable text, plus the link to the published viewer if one is configured. | S | no |

### 3.6 AI summaries
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-A1 | If an API key is configured, a model summarises each changed page against the profile; without a key the app works with extractive output. | M | yes |
| FR-A2 | Prompts instruct the model to say "unclear" rather than guess, and to quote its basis. | M | partial |
| FR-A3 | Model output is marked as AI-generated in the digest. | M | no |
| FR-A4 | Only page text and the profile are sent to the model, never other personal data. | M | yes |
| FR-A5 | A summary failure falls back to extractive output and is noted. | M | partial (message only) |

### 3.7 Database and viewer
Database: SQLite file `scholarships.db` on the user's PC.

| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-B1 | Each opportunity is a row with: name, provider, university, geography (England, Scotland, Wales, Northern Ireland, Ireland, Austria, Spain, other), topics (art history, economics, arts management, other), level (Master's, PhD, both), stipend type, value and currency, opens date, deadline, entry year, eligibility label with reason, point of contact, source URL, supporting quote, first seen, last seen, last checked, status. | M | no |
| FR-B2 | Stipend type is one of: full funding, tuition waiver, stipend only, partial award, travel or research grant, other, not stated. | M | no |
| FR-B3 | Point of contact is stored only as the organisation's public contact shown on the source page (office name, email, phone or contact-page URL); otherwise "not stated". Personal contact details are never guessed. | M | no |
| FR-B4 | Deadlines are stored as ISO dates with an "approximate" flag; value as a number plus currency, or "not stated". | M | no |
| FR-B5 | The same opportunity found on several pages is stored once, with all source URLs. | S | no |
| FR-B6 | A change to an opportunity is written to a history table (field, old value, new value, date). | S | no |
| FR-B7 | The user's own marks (saved, applied, dismissed, note) are stored in the database and set by a command such as `scan.py mark <id> applied`. | S | no |
| FR-B8 | Opportunities whose deadline has passed become "closed", never deleted. | M | no |
| FR-B9 | The schema has a version number; upgrades keep existing data. A backup copy is made before each run. | S | no |
| FR-V1 | The agent exports the database to one self-contained `viewer.html` (data embedded, no external requests). It opens locally by double-click and can be published unchanged as a private page. | M | no |
| FR-V2 | Filters: deadline date range, first-seen date range, topic, geography, level, stipend type, eligibility label, entry year, has point of contact, status (open, closing soon, closed), user mark; plus free-text search. Filters combine (AND) and can be cleared in one step. | M | no |
| FR-V3 | The list can be sorted by deadline, value, first seen and name. | M | no |
| FR-V4 | Each item opens to its details: quote, source link, point of contact, date last checked, change history, and whether the data was AI-generated. | M | no |
| FR-V5 | Items closing within 30 days and items first seen since the last run are visually marked (not by colour alone). | S | no |
| FR-V6 | The viewer works at phone width and in light and dark mode; every control has a name and is at least 44 px tall. | S | no |
| FR-V7 | The viewer shows when the data was exported, and warns if the export is older than 14 days. | S | no |
| FR-V8 | Publishing: the viewer is published as a private page and republished after each scan. The scanner cannot publish by itself, because publishing needs a Claude session; the scan produces the file and a Claude session (or the user in Claude) republishes it. | M | no |
| FR-V9 | The published page holds only public scholarship data and the user's marks, with no API keys, email settings or other personal data. The user is told that anyone given the link sees their marks. | M | no |

### 3.8 Scheduling and operation
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-O1 | The agent runs from one command and from a scheduler (Windows Task Scheduler). | M | yes |
| FR-O2 | A run finishes in under 10 minutes for 100 sources. | S | untested |
| FR-O3 | Running twice on the same day does not lose the earlier digest. | M | no (overwrites) |
| FR-O4 | The user can run the agent for a single source. | C | no |

### 3.9 Profile
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-P1 | The profile (citizenships, fields, levels, entry year) is edited in the config file. | M | yes |
| FR-P2 | Changing the profile changes eligibility labels on the next run. | M | no |

## 4. Non-functional requirements
| ID | Requirement | Pri |
|---|---|---|
| NFR-1 Accuracy | No displayed deadline, value or eligibility statement lacks a source quote or an "AI-generated" or "not stated" mark. | M |
| NFR-2 Freshness | Every item shows the date its source was last checked. | M |
| NFR-3 Politeness | At most one request per 3 s per host, and at most 1 run per day by default. | M |
| NFR-4 Privacy | No telemetry. The only outbound traffic is to the configured sources and, if enabled, the model API. Citizenship is sent to the model only as a country name. | M |
| NFR-5 Secrets | The API key and the SMTP password are read from environment variables and never written to state, digests, logs, the database or the viewer. | M |
| NFR-6 Portability | Runs on Windows, macOS and Linux with Python 3.10+. The core needs no third-party packages; Playwright is installed only for JavaScript pages and the agent says clearly if it is missing. | M |
| NFR-7 Robustness | Malformed HTML, empty pages, huge pages (>5 MB), redirects and wrong encodings do not crash a run. | M |
| NFR-8 Maintainability | Adding a source needs no code change; each module has tests. | S |
| NFR-10 Auto-discovery safety | Auto-added sources respect FR-F3 and NFR-3 like any other, and cannot widen the scan beyond the cap in FR-S6. | M |
| NFR-9 Transparency | The README states limits: no JavaScript pages, not legal advice, deadlines must be confirmed on the official page. | M |

## 5. Assumptions and decisions
1. The user runs the agent on their own computer, because the cloud workspace cannot reach university sites.
2. "Fall 2027" means a start between August and December 2027.
3. Decided: Master's and PhD; digest file plus email; AI optional; headless browser included; automatic source discovery with guardrails; database and filterable viewer, published as a private page.

4. Decided: email goes out through Outlook/Hotmail SMTP (smtp-mail.outlook.com, port 587) with an app password. Microsoft may require app passwords or may restrict basic SMTP sign-in on some accounts, so this must be tested early (TC-M1, TC-L6).
5. Decided: the AI key is optional and the user does not have one yet. The README will explain how to create one.
6. Decided: the first source list covers the Russell Group, art-specialist institutions (Courtauld, RCA, UAL, Goldsmiths, SOAS, Sotheby's Institute), Irish universities, and all UK universities (about 140). Starting with the first three groups as hand-checked sources and adding the rest through FR-S4 is the planned order, because 140 unreviewed sources would produce a lot of noise.

Open: none for requirements v0.2.
