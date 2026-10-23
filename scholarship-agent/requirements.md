# Scholarship Scanner – Requirements Specification
Version 0.1 · 2026-10-23 · Status: draft for review

## 1. Purpose
A personal agent that regularly checks UK and Irish university pages and home-country funders, and tells one user about new or changed scholarships for **autumn 2027** entry. It reports only what the source pages say and never invents a deadline, amount or eligibility.

**Out of scope for v1:** applying on the user's behalf, multi-user accounts, a hosted server, a mobile app, countries other than UK, Ireland, Austria and Spain, and legal or immigration advice.

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
| FR-S4 | The agent can discover candidate sources from a university list and propose them for the user to approve. | C | no |
| FR-S5 | A source can be disabled without deleting it. | S | no |

### 3.2 Fetching
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-F1 | The agent fetches each source over HTTPS and reduces the page to plain text (no scripts, menus, footers). | M | yes |
| FR-F2 | It waits between requests and uses an identifying User-Agent. | M | yes (3 s) |
| FR-F3 | It honours robots.txt and skips disallowed pages with a note. | M | no |
| FR-F4 | A failed source (timeout, HTTP error, DNS) is recorded in the digest and does not stop the run. | M | yes |
| FR-F5 | Linked PDFs (call documents, guidance notes) are fetched and read. | S | no |
| FR-F6 | Pages that need JavaScript can be fetched through a headless browser, per source. | C | no |
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
| FR-D7 | Optional delivery of the digest by email. | C | no |

### 3.6 AI summaries
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-A1 | If an API key is configured, a model summarises each changed page against the profile; without a key the app works with extractive output. | M | yes |
| FR-A2 | Prompts instruct the model to say "unclear" rather than guess, and to quote its basis. | M | partial |
| FR-A3 | Model output is marked as AI-generated in the digest. | M | no |
| FR-A4 | Only page text and the profile are sent to the model, never other personal data. | M | yes |
| FR-A5 | A summary failure falls back to extractive output and is noted. | M | partial (message only) |

### 3.7 Scheduling and operation
| ID | Requirement | Pri | Now |
|---|---|---|---|
| FR-O1 | The agent runs from one command and from a scheduler (Windows Task Scheduler). | M | yes |
| FR-O2 | A run finishes in under 10 minutes for 100 sources. | S | untested |
| FR-O3 | Running twice on the same day does not lose the earlier digest. | M | no (overwrites) |
| FR-O4 | The user can run the agent for a single source. | C | no |

### 3.8 Profile
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
| NFR-5 Secrets | The API key is read from an environment variable and never written to state, digests or logs. | M |
| NFR-6 Portability | Runs on Windows, macOS and Linux with Python 3.10+ and no third-party packages (v1). | M |
| NFR-7 Robustness | Malformed HTML, empty pages, huge pages (>5 MB), redirects and wrong encodings do not crash a run. | M |
| NFR-8 Maintainability | Adding a source needs no code change; each module has tests. | S |
| NFR-9 Transparency | The README states limits: no JavaScript pages, not legal advice, deadlines must be confirmed on the official page. | M |

## 5. Assumptions and open questions
1. The user runs the agent on their own computer, because the cloud workspace cannot reach university sites.
2. "Fall 2027" means a start between August and December 2027.
3. Open: Master's, PhD or both? Which universities first? Email delivery wanted? Is an API key available?
