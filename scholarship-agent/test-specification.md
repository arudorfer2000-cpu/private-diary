# Scholarship Scanner – Test Specification
Version 0.2 · 2026-10-23 · Covers requirements.md v0.2

## 1. Approach
- **Unit tests** use local HTML/PDF fixtures and a fake HTTP server, so no test touches a real university site.
- **Live smoke test** runs once, by hand, on the user's PC against the real sources.
- **Accuracy review** is a manual check of a sample of digest items against the official pages.
- Status values: not run · pass · fail. Nothing is marked pass without recorded evidence (command output or screenshot).
- No test has been run yet; the current repo has no automated tests.

## 2. Test fixtures
| Fixture | Content |
|---|---|
| F1 | Scholarship page with "Deadline: 18 January 2027", "£32,000", "open to international students" |
| F2 | Same page with the deadline changed to 25 January 2027 |
| F3 | Same page as F1 with only the cookie banner and footer year changed |
| F4 | Page restricted to "UK Home students" |
| F5 | Page for "September 2026 entry" |
| F6 | Page with no dates or amounts |
| F7 | Page with only "closing in January" |
| F8 | Page with a link to a guidance PDF containing the deadline |
| F9 | Empty page, 6 MB page, malformed HTML, Latin-1 page |
| F10 | robots.txt that disallows the page |
| F11 | Page that needs JavaScript to show its content |
| F12 | University index page linking to 8 department pages (3 relevant, 3 irrelevant, 1 login page, 1 external site) |
| F13 | Database seeded with 40 opportunities across all geographies, topics, levels and stipend types |
| F14 | Page listing a public contact (office name, email) and one with no contact |

## 3. Test cases
### Sources and config
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-S1 | FR-S1 | Add a source to `sources.json`, run | New source appears as NEW with no code change |
| TC-S2 | FR-S1 | Remove a field from a source or give invalid JSON | Clear error naming the file and field; no partial run |
| TC-S3 | FR-S5 | Disable a source | Not fetched; listed as disabled in the summary |
| TC-S4 | FR-S2 | Count regions in the shipped config | UK, Ireland, Austria and Spain each have at least one source |
| TC-S5 | FR-S4, FR-S6 | Run on F12 | The 3 relevant pages are added as "auto-added" with date, reason and discovery page; the others are not tracked |
| TC-S6 | FR-S6 | Run on a discovery page with 12 relevant links | Exactly 5 added; the other 7 wait for the next run |
| TC-S7 | FR-S6 | Add a candidate that mentions no funding or fields | Goes to the "rejected candidates" log with the reason |
| TC-S8 | FR-S7 | Run on F12 | The login page and the external site are not added |
| TC-S9 | FR-S6 | Remove an auto-added source | Stops being scanned and is not re-added on the next run |
| TC-S10 | FR-S6, FR-D7 | Auto-add a source whose first check finds an urgent deadline | Appears in the digest, but not in the urgent email subject until the first check has succeeded |

### Fetching
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-F1 | FR-F1 | Fetch F1 | Output has the text, no script or menu content |
| TC-F2 | FR-F2, NFR-3 | Run on 3 sources of one fake host, record timestamps | At least 3 s between requests; User-Agent identifies the tool |
| TC-F3 | FR-F3 | Fetch F10 | Not fetched; digest notes "disallowed by robots.txt" |
| TC-F4 | FR-F4 | One source returns 404, one times out, one is fine | Both failures listed under "Could not fetch"; the good source is processed |
| TC-F5 | FR-F5 | Fetch F8 | Deadline from the PDF appears in the extraction |
| TC-F6 | FR-F7 | Fail one source on 3 consecutive runs | Flagged "possibly moved" on the third |
| TC-F7 | NFR-7 | Fetch each F9 variant | No crash; each gives a clear note or empty text |
| TC-F8 | FR-F6 | Fetch F11 | Plain fetch yields nearly empty text; the agent switches the source to the browser and extracts the rendered content |
| TC-F9 | FR-F6, NFR-6 | Run F11 without Playwright installed | Clear message naming the missing package and how to install it; other sources still processed |

### Change detection
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-C1 | FR-C1 | Run on F1 twice | First NEW, second unchanged |
| TC-C2 | FR-C1 | Run F1, then F2 | CHANGED |
| TC-C3 | FR-C2 | Run F1, then F3 | unchanged (noise ignored) |
| TC-C4 | FR-C3 | Run F1, then F2 | Digest shows the old and new deadline |
| TC-C5 | FR-C4 | Run with every source failing | `state.json` is unchanged afterwards |
| TC-C6 | FR-C5 | Run 5 times with changes | Last N states retained and no more |

### Extraction and matching
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-E1 | FR-E1 | Extract F1 | Deadline 18 January 2027, value £32,000, international eligible |
| TC-E2 | FR-E2 | Extract F6 | Value, deadline and eligibility all "not stated"; no invented values |
| TC-E3 | FR-E3 | Extract F1 with the default profile | Eligible |
| TC-E4 | FR-E4 | Extract F4 | Not eligible, reason "UK Home students only" |
| TC-E5 | FR-E5 | Extract F5 | Flagged "other year (2026)" and excluded from the 2027 list |
| TC-E6 | FR-E6 | Extract F1 | Each field has a quote that appears verbatim in the page text |
| TC-E7 | FR-E7 | Extract F7 | Deadline kept as text "January", marked approximate |
| TC-E8 | FR-E3, FR-P2 | Change the profile to a UK citizen, rerun F4 | Label changes to eligible |
| TC-E9 | NFR-1 | Scan 100 random extracted facts in a test digest | None lacks a quote, an "AI" mark or "not stated" |

### Digest and master list
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-D1 | FR-D1 | Run with 2 changed sources | Digest has 2 items, dated filename |
| TC-D2 | FR-D2 | Items with deadlines in 10, 40 and 90 days | Ordered 10, 40, 90; the first marked urgent |
| TC-D3 | FR-D3 | Run with mixed results | Header shows counts of new, changed, failed |
| TC-D4 | FR-D4 | Dismiss an item, rerun | Item does not reappear |
| TC-D5 | FR-D5 | Run twice with a deadline passing in between | Item moves from open to closed |
| TC-D6 | FR-D6 | Export | CSV opens in a spreadsheet; calendar file imports into a calendar with correct dates |
| TC-D7 | FR-O3 | Run twice on the same day | Both digests kept |
| TC-D8 | NFR-2 | Open any digest item | Shows "checked on" date |

### AI summaries
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-A1 | FR-A1 | Run with no key | Extractive output, no error |
| TC-A2 | FR-A1, FR-A3 | Run with a key against F1 | Summary present and marked AI-generated |
| TC-A3 | FR-A2 | Give the model F6 | Summary says "unclear" or "not stated", with no invented figures |
| TC-A4 | FR-A5 | Use an invalid key | Falls back to extractive output and notes the failure |
| TC-A5 | FR-A4, NFR-4 | Capture the request body | Contains only page text, the profile and instructions |
| TC-A6 | NFR-5 | Search state, digests and logs for the key | Not found |

### Database
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-B1 | FR-B1, FR-B2 | Process F1 and F4 | Rows contain all listed fields; stipend type is from the allowed list |
| TC-B2 | FR-B3 | Process F14 | Public contact stored; page without one shows "not stated"; no email address is invented |
| TC-B3 | FR-B4 | Process F1 and F7 | F1: ISO date 2027-01-18, 32000 GBP; F7: text "January", approximate flag set |
| TC-B4 | FR-B5 | Find the same scholarship on two source pages | One row with both source URLs |
| TC-B5 | FR-B6 | Run F1 then F2 | History row: deadline, old 2027-01-18, new 2027-01-25 |
| TC-B6 | FR-B7 | `scan.py mark <id> applied` then rerun | Mark kept; the item is not reported as new again |
| TC-B7 | FR-B8 | Set the clock past a deadline and rerun | Status closed; row still present |
| TC-B8 | FR-B9 | Open a database from the previous schema version | Upgrade keeps all rows; backup file exists |
| TC-B9 | NFR-5 | Search the database file for the API key and SMTP password | Not found |

### Viewer
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-V1 | FR-V1 | Export F13 and open `viewer.html` with the network disabled | Page loads fully with all 40 items; no external request |
| TC-V2 | FR-V2 | Apply each filter alone on F13 (deadline range, first seen, topic, geography, level, stipend type, eligibility, entry year, has contact, status, mark) | Result count equals the expected count computed from the fixture |
| TC-V3 | FR-V2 | Combine three filters | Only items matching all three; clearing restores 40 |
| TC-V4 | FR-V2 | Search for a word in a name and in a quote | Matching items only |
| TC-V5 | FR-V3 | Sort by each key, both directions | Order matches the fixture |
| TC-V6 | FR-V4 | Open an item | Shows quote, source link, contact, last checked date, history, AI mark where relevant |
| TC-V7 | FR-V5 | Fixture items closing in 10 and 40 days, and one new | The 10-day and new items are marked with text or icon, not colour only |
| TC-V8 | FR-V6 | Open at 390 px width, light and dark; run an automated accessibility scan | No horizontal scroll; no scan errors; all controls named and at least 44 px |
| TC-V9 | FR-V7 | Export with a timestamp 15 days old | Warning is shown |
| TC-V10 | FR-V8 | Publish the viewer as a private page, then rerun the scan and republish | Same link; the new export is shown; page is private by default |
| TC-V11 | FR-V9 | Search the published page source for the API key, SMTP password and email address | Not found |

### Email
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-M1 | FR-D7 | Run with new items against a test SMTP server | One email arrives with the digest as text |
| TC-M2 | FR-D7 | Run with no new or changed items | No email sent |
| TC-M3 | FR-D7 | Include an item closing in 10 days | Subject marks it urgent |
| TC-M4 | FR-D7 | Use a wrong SMTP password | The run completes, the digest file is written, and the failure is reported without printing the password |
| TC-M5 | FR-D8 | Configure a viewer link | The link appears in the email |
| TC-M6 | NFR-5 | Search logs and the email source for the password | Not found |

### Operation and non-functional
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-O1 | FR-O1 | Run from a fresh shell and from Task Scheduler | Both produce a digest |
| TC-O2 | FR-O2 | Run 100 fake sources with 0.1 s latency | Finishes in under 10 minutes |
| TC-O3 | NFR-3 | Run twice within an hour | Second run warns or is refused unless forced |
| TC-O4 | NFR-4 | Monitor network connections during a run | Only configured hosts and, if enabled, the model API |
| TC-O5 | NFR-6 | Run on Windows, macOS and Linux | Passes TC-C1 and TC-E1 on each |
| TC-O7 | NFR-10 | Auto-discovery run against a fake host with robots.txt F10 | Disallowed pages are neither added nor fetched |
| TC-O6 | NFR-9 | Read the README | States the limits listed in NFR-9 |

### Live acceptance (manual, on the user's PC)
| ID | Steps | Expected |
|---|---|---|
| TC-L1 | Run against the 23 real sources | Each fetches or appears under "Could not fetch" with a reason |
| TC-L2 | Sample 10 digest items, compare with the official pages | Every deadline and value matches, or is marked uncertain; any mismatch is a failure |
| TC-L3 | Run again after a week | Only truly changed pages are reported; noise rate under 20% |
| TC-L4 | Check each region (UK, Ireland, Austria, Spain) | At least one useful item per region, or an explained gap |
| TC-L5 | After two runs with auto-discovery, review every auto-added source | At least 80% are relevant; each irrelevant one can be removed in one step |
| TC-L6 | Run on the PC and read the email on the phone | Email arrives and its link opens the published viewer |
| TC-L7 | Open the published viewer on the iPhone and use three filters | Works at phone width; counts match the database |

## 4. Traceability
Every FR and NFR above has at least one TC. FR-S2 and FR-S4 are checked by TC-S4 and TC-L1/L4. Requirements marked "no" in the "Now" column have no passing test until they are built.

## 5. Exit criteria for v1
All "M" requirements have a passing test with recorded evidence; TC-L2 passes with zero mismatches and TC-L5 reaches 80%; no failed test is weakened to pass.
