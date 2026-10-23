# Scholarship Scanner – Test Specification
Version 0.1 · 2026-10-23 · Covers requirements.md v0.1

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

## 3. Test cases
### Sources and config
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-S1 | FR-S1 | Add a source to `sources.json`, run | New source appears as NEW with no code change |
| TC-S2 | FR-S1 | Remove a field from a source or give invalid JSON | Clear error naming the file and field; no partial run |
| TC-S3 | FR-S5 | Disable a source | Not fetched; listed as disabled in the summary |
| TC-S4 | FR-S2 | Count regions in the shipped config | UK, Ireland, Austria and Spain each have at least one source |

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
| TC-F8 | FR-F6 | Fetch F11 with the browser option on | Content from the rendered page is extracted |

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

### Operation and non-functional
| ID | Covers | Steps | Expected |
|---|---|---|---|
| TC-O1 | FR-O1 | Run from a fresh shell and from Task Scheduler | Both produce a digest |
| TC-O2 | FR-O2 | Run 100 fake sources with 0.1 s latency | Finishes in under 10 minutes |
| TC-O3 | NFR-3 | Run twice within an hour | Second run warns or is refused unless forced |
| TC-O4 | NFR-4 | Monitor network connections during a run | Only configured hosts and, if enabled, the model API |
| TC-O5 | NFR-6 | Run on Windows, macOS and Linux | Passes TC-C1 and TC-E1 on each |
| TC-O6 | NFR-9 | Read the README | States the limits listed in NFR-9 |

### Live acceptance (manual, on the user's PC)
| ID | Steps | Expected |
|---|---|---|
| TC-L1 | Run against the 23 real sources | Each fetches or appears under "Could not fetch" with a reason |
| TC-L2 | Sample 10 digest items, compare with the official pages | Every deadline and value matches, or is marked uncertain; any mismatch is a failure |
| TC-L3 | Run again after a week | Only truly changed pages are reported; noise rate under 20% |
| TC-L4 | Check each region (UK, Ireland, Austria, Spain) | At least one useful item per region, or an explained gap |

## 4. Traceability
Every FR and NFR above has at least one TC. FR-S2 and FR-S4 are checked by TC-S4 and TC-L1/L4. Requirements marked "no" in the "Now" column have no passing test until they are built.

## 5. Exit criteria for v1
All "M" requirements have a passing test with recorded evidence; TC-L2 passes with zero mismatches; no failed test is weakened to pass.
