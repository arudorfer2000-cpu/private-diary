# Test results (build v0.3) — 2026-10-23

Environment: cloud workspace, Python 3.13, Node 22 + Chromium. No access to real university sites, real SMTP, Playwright for Python, or an iPhone.

## Command and result
    python run_tests.py
    Ran 51 tests ... OK
    viewer checks: 36 passed, 0 failed
Mutation check: breaking the EU filter and the country filter in a copy of `viewer.html` made 4 viewer checks fail (V12 UK/EU, V2 country, V13), so the viewer test can fail.
Smoke run `python scan.py --no-email` with the network blocked: no crash; 43 of 43 sources listed under "could not be checked"; digest and viewer written; database left unchanged.

## Defects found by the tests and fixed
- Auto-discovery accepted unrelated sports-scholarship pages because "postgraduate" counted as a field match. Relevance now needs one of the user's fields (or "all subjects").
- Eligibility did not change with the profile (TC-E8): a UK citizen is now eligible for "UK Home students only" awards.

## Covered by passing automated tests (TC ids)
S1 S3 S5 S6 S7 S8 S9 S10 S11 · F1 F2 F3 F4 F6 F7 F9 · C1 C2 C3 C4 C5 · E1–E8 E10 E11 · B1 B2 B3 B5–B11 · D1 D2 D3 D4 D5 D7 D8 · M1–M6 · A1 A2 A4 A5 A6 · V1–V9 V11 V12 V13 (viewer, headless Chromium) · FR-C3 old/new values in the digest.

## NOT tested or not built — do not treat as done
- **Real sites (TC-L1–L8):** none run. The 43 source URLs are unverified guesses; extraction quality on real pages is unknown. TC-L2 (compare 10 items with official pages) is the acceptance test and must be done on your PC.
- **Real email:** only a fake SMTP server was used. Outlook/Hotmail sign-in is untested and may need an app password or be blocked by Microsoft.
- **JavaScript rendering (FR-F6, TC-F8):** the browser path is written but never executed; Playwright for Python is not installed here. Only the "missing package" message is tested.
- **Real AI calls:** only a fake HTTP opener. The model is used for summaries only, not for eligibility; eligibility is rule-based.
- **Not built:** PDF reading (FR-F5), per-source field tags (FR-S3), page-state history (FR-C5), CSV and calendar export (FR-D6), run for one source from the command line (FR-O4), once-a-day limit (NFR-3 second half), performance test (TC-O2), network monitoring (TC-O4), cross-OS runs (TC-O5), Task Scheduler (TC-O1), published viewer page (TC-V10, FR-V8), iPhone/Safari viewing (TC-L7).
- Discovery finds funding pages by following links on tracked pages; it does not yet read university lists, so the roughly 140 UK universities and the EU states beyond the starting set are not covered yet.
