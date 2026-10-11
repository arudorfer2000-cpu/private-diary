# checks.md

Checks are written BEFORE the work. Verdict values: PENDING, PASS, FAIL. A check is never weakened to get a pass.

## Step 0.1 / 0.2 – Project start and screens

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 0.1 | `npx expo start` shows a QR code and the starter screen opens on the iPhone in Expo Go | PENDING (device) | Metro and QR code seen running on the PC (photo, 2026-10-11 08:49); iPhone result not yet reported |
| 0.2 | All four screens (Vault, Calendar, Voice, Review) reachable on the iPhone and match the canvas | PENDING (device) | Cloud check only: `tsc` clean and iOS bundle builds |

## Step 1.1 – Encryption module (src/crypto)

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 1.1 | C1: Encrypt an entry, then decrypt it: the original text comes back exactly (including umlauts and emoji) | PASS | `npm test`: test 1 ok (text with ä ö ü ß, emoji, newlines, quotes) |
| 1.1 | C2: Unlocking with a wrong passcode fails | PASS | `npm test`: test 2 ok (WRONG_PASSCODE thrown; right passcode returns identical data key) |
| 1.1 | C3: Recovery key unlocks the same data key; a wrong recovery key fails | PASS | `npm test`: test 3 ok (also accepts lower case and spaces; foreign and malformed keys rejected) |
| 1.1 | C4: Stored ciphertext and key bundle contain no readable plaintext, passcode or raw data key | PASS | `npm test`: test 4 ok (searched stored JSON and ciphertext for text, name, passcode, data key hex, recovery key) |
| 1.1 | C5: A changed ciphertext fails; ciphertext moved to another entry id fails | PASS | `npm test`: test 5 ok (flipped byte, other entry id, garbage string, wrong key all rejected) |
| 1.1 | C6: Encrypting the same text twice gives different ciphertext (random nonce) | PASS | `npm test`: test 6 ok |
| 1.1 | C7: Changing the passcode: old fails, new works, old entries still decrypt | PASS | `npm test`: test 7 ok (recovery key also still works, new salt used) |
| 1.1 | C8: `tsc --noEmit` has no errors and the iOS bundle builds | PASS | `npm run typecheck` exit 0 (app and tests); `expo export --platform ios` produced a 1.6 MB Hermes bundle with the crypto module included |
| 1.1 | C9 (device): Argon2id unlock time on the iPhone is measured and below 3 seconds | PENDING (needs the iPhone, measured in step 1.2) | Cloud Node reference only: setup 281 ms, unlock 301 ms with m=16 MiB, t=2. The iPhone in Expo Go will be much slower; this is exactly what step 1.2 measures |

## Honest limits of what these checks prove
- Tests ran in cloud Node, not on an iPhone. The iPhone uses a different JavaScript engine (Hermes) and slower processing.
- Pure JavaScript cannot reliably wipe keys from memory after use.
- The code has not had an independent security review yet (planned in step 4.2).

## Step 1.2 – Vault: real passcode, attempt limit, auto-lock, Face ID

Written before the code. Cloud checks (V) run in Node with an in-memory store and a fake clock. Device checks (D) need the iPhone.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 1.2 | V1: First setup creates a passcode and recovery key; the stored data holds no readable passcode or data key; the right passcode unlocks | PASS | `npm test`: test 9 ok (stored data searched for passcode, data key and recovery key: not found; a second setup is refused) |
| 1.2 | V2: A wrong passcode is rejected and the answer says how many tries are left before a pause | PASS | `npm test`: test 10 ok (tries left shown as 4, 3, 2, 1) |
| 1.2 | V3: After 5 wrong tries the next tries are refused for 30 s even with the correct passcode; the wait doubles per further failure and is capped at 15 min | PASS | `npm test`: test 11 ok (pauses 30 s, 60, 120, 240, 480, then 900 s cap; the right passcode is refused during a pause; tries during a pause are refused and not counted) |
| 1.2 | V4: The pause survives an app restart (new service instance, same storage) | PASS | `npm test`: test 12 ok (new service instance on the same storage is still paused with 30 s left) |
| 1.2 | V5: After the pause has passed, the correct passcode works and the counter resets | PASS | `npm test`: test 13 ok (right passcode works after the pause; next wrong try shows 4 tries left again) |
| 1.2 | V6: Recovery key unlocks; then a new passcode can be set; the old passcode no longer works | PASS | `npm test`: test 14 ok (wrong recovery key rejected and counted; right one returns the same data key; old passcode fails after the change) |
| 1.2 | V7: Auto-lock rule: locks when idle time reaches the limit, not before; locks on return from background after the limit; limit 0 locks at once | PASS | `npm test`: test 15 ok (pure rules only; the wiring in App.tsx is checked on the phone in D3) |
| 1.2 | V8: `npm run typecheck` is clean and the iOS bundle builds | PASS | `npm run typecheck` exit 0; `npm test` 16 of 16 pass; `expo export --platform ios` built a 1.6 MB Hermes bundle |
| 1.2 | D1: On the iPhone, first launch shows passcode setup, then the recovery key; later launches show unlock | PENDING (device) | |
| 1.2 | D2: On the iPhone, 5 wrong passcodes show a countdown and block input | PENDING (device) | |
| 1.2 | D3: On the iPhone, putting the app in the background for longer than the limit locks it (test build limit is 1 minute, spec default is 5) | PENDING (device) | |
| 1.2 | D4: Face ID unlock works (Expo Go may not support it; a development build would) | PENDING (device) | |
| 1.2 | D5 (= C9): Passcode unlock time on the iPhone is shown and below 3 seconds | PENDING (device) | |

### Honest limits of the step 1.2 checks
- The screens, Face ID and the keychain were only compiled, never run. They need the iPhone (D1 to D5).
- The pause relies on the phone clock; changing the clock can shorten it.
- A 6-digit passcode is weak against offline guessing if someone extracts the stored key bundle from the phone. The slow Argon2id key derivation and the device-only keychain make that hard, but a longer passcode option is worth adding later.
- Entries are still only in memory (encrypted storage comes in step 1.3). Unsaved text is lost if the diary locks while writing; typing counts as activity, and autosave arrives in step 1.4.

## Step 1.3 – Encrypted local storage (SQLite)

Written before the code. Cloud checks (S) run in Node with node:sqlite behind the same small database interface the app uses with expo-sqlite. Device checks (T) need the iPhone.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 1.3 | S1: Create an entry, read it back: mood, title and text come back exactly (umlauts, emoji, newlines) | PASS | `npm test`: test 9 ok (umlauts, emoji, newlines, quotes; Node SQLite on a real file) |
| 1.3 | S2: The database file contains no readable title, text or mood (raw bytes searched); only the day and timestamps are clear | PASS | `npm test`: test 10 ok (file bytes searched as latin1 and utf8 for title, text, field names: not found; the day is clear by design) |
| 1.3 | S3: Update an entry: new content comes back, old ciphertext is gone, created time kept, updated time changes | PASS | `npm test`: test 11 ok (one row, payload changed, created time kept, updated time later) |
| 1.3 | S4: Delete an entry: it is no longer listed or readable | PASS | `npm test`: test 12 ok |
| 1.3 | S5: Listing a month returns only that month's entries, ordered by day; days without entries are absent | PASS | `npm test`: test 13 ok (adjacent months 09-30 and 11-01 excluded; order by day) |
| 1.3 | S6: Reading with a wrong data key fails (no plaintext); a ciphertext copied to another entry row fails to decrypt | PASS | `npm test`: test 14 ok (wrong key rejected; payload moved to another row rejected) |
| 1.3 | S7: Data survives reopening the database (new repository instance on the same file) | PASS | `npm test`: test 15 ok (database closed, reopened, schema creation repeated, entry intact) |
| 1.3 | S8: The recovery blob is stored in the database meta table, contains no plaintext, and can be read back; `npm test`, `npm run typecheck` clean and the iOS bundle builds | PASS | `npm test`: test 16 ok; `npm test` 24 of 24 pass; `npm run typecheck` exit 0; `expo export --platform ios` 1.8 MB Hermes bundle containing expo-sqlite and the recovery blob code, sample entries gone |
| 1.3 | T1: On the iPhone, an entry saved today is still there after fully closing and reopening Expo Go and unlocking | PENDING (device) | |
| 1.3 | T2: On the iPhone, the calendar shows only real entries (no sample data) and locking clears them from the screen | PENDING (device) | |

### Honest limits of the step 1.3 checks
- Node's SQLite is not the iPhone's; the SQL is the same but the device run (T1, T2) is what proves it there.
- Day and timestamps are stored unencrypted so the calendar can query; they reveal when entries exist, not what they say.
- The key bundle in the keychain is device-only; restoring on a new phone needs the recovery blob (stored here, restore flow comes in step 1.6).

## Step 1.4 – Editor with autosave

Written before the code. Cloud checks (A) use a fake clock and the real encrypted repository on a file. Device checks (E) need the iPhone.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 1.4 | A1: Typing saves after a short pause (not before); many quick changes cause one save holding the latest text | PASS | `npm test`: test 9 ok (nothing stored at 500 ms after the last change; one entry with the latest text at 600 ms) |
| 1.4 | A2: Flush saves pending changes at once and waits until they are stored | PASS | `npm test`: test 10 ok (flush stores at once, timer cleared) |
| 1.4 | A3: The first save creates the entry; every later save updates the same entry (never a duplicate), even when typing continues while a save is running | PASS | `npm test`: test 11 ok (create then updates; a second change during a held-back save is queued; one row at the end) |
| 1.4 | A4: Unchanged content is not saved again | PASS | `npm test`: test 12 ok (no write issued, updated time unchanged) |
| 1.4 | A5: A new entry with empty title and text is never created; clearing everything in an existing entry removes it | PASS | `npm test`: test 13 ok |
| 1.4 | A6: A failed save reports an error, keeps the text, and is retried by the next change or flush | PASS | `npm test`: test 14 ok (create failed: flush false, status error; retry without new typing stored the text) |
| 1.4 | A7: Discard: a new entry is removed; an existing entry returns to its content from before editing | PASS | `npm test`: test 15 ok |
| 1.4 | A8 (TC-9 in the cloud): After autosave, a brand new repository instance on the same database file reads the typed text, as if the app was killed mid-sentence; the file holds no readable text; typecheck clean, all tests pass, iOS bundle builds | PASS | `npm test`: test 16 ok (new repository on the same file read the text; file has no readable text). `npm test` 32 of 32 pass; `npm run typecheck` exit 0; `expo export --platform ios` 1.8 MB Hermes bundle containing the new editor |
| 1.4 | E1: On the iPhone, type a sentence, wait 2 seconds, force-close Expo Go, reopen and unlock: the sentence is there | PENDING (device) | |
| 1.4 | E2: On the iPhone, type, then switch to another app straight away: back in the diary (or after the lock) the text is there | PENDING (device) | |
| 1.4 | E3: On the iPhone, Write on a day that has an entry opens that entry's text, mood and title for editing | PENDING (device) | |

### Honest limits of the step 1.4 checks
- A force-close within about half a second of the last keystroke can still lose those last characters (the pause before saving). The pause is 600 ms.
- Switching apps flushes the save, but iOS may suspend the app before the write finishes; the 600 ms autosave is the main protection.
- One entry per day for now; "Add another" appends dictated text to that day's entry.

## Step 1.5 – Calendar from real data

Written before the code. Cloud checks (K) run in Node (calendar rules plus the real encrypted repository). Device checks (L) need the iPhone.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 1.5 | K1: Month grid is right for known months (blank cells before day 1 with Monday first, days in month incl. leap February) | PASS | `npm test`: test 1 ok (8 months incl. leap 2024, 2000, non-leap 2100) |
| 1.5 | K2: Weekday names are right for known dates (e.g. 11 Oct 2026 is a Sunday) | PASS | `npm test`: test 2 ok |
| 1.5 | K3: Previous/next month works across year ends; next never goes beyond the current month | PASS | `npm test`: test 3 ok |
| 1.5 | K4: Streak: consecutive days ending today; still alive if yesterday is written but today is not; a gap ends it; works across month and year boundaries; 0 when nothing recent | PASS | `npm test`: test 4 ok (11 cases incl. month, year and leap-day boundaries) |
| 1.5 | K5 (TC-14): Days marked in a month are exactly the days with saved entries in that month (month ends, other months, deletions included) | PASS | `npm test`: test 5 ok (real encrypted repository; month ends, neighbouring months, other year, deletion; listDays) |
| 1.5 | K6: "Today" comes from the phone's local date (late evening and just after midnight give the local day, not the UTC day) | PASS | `npm test`: test 6 ok (23:30, 00:10, new year, year end) |
| 1.5 | K7: No hardcoded "October 2026", TODAY or sample data left in src; `npm test`, `npm run typecheck` clean; iOS bundle builds | PASS | `npm test` 38 of 38 pass; `npm run typecheck` exit 0; `expo export --platform ios` 1.8 MB Hermes bundle. grep of src and App.tsx finds no "October 2026", TODAY, sample entries or fixed dates in the calendar, storage or App code; I also removed the leftover fixed title "Telling Mara" that dictated entries received. Scope note: the simulated dictation text stays in Voice.tsx on purpose (it is the prototype of dictation, replaced in steps 2.5/3), it is not calendar data |
| 1.5 | L1: On the iPhone, the calendar shows the real current month with today highlighted | PENDING (device) | |
| 1.5 | L2: On the iPhone, an entry saved today colours today in its mood colour and the streak shows 1 day | PENDING (device) | |
| 1.5 | L3: On the iPhone, the previous-month arrow shows the earlier month; tapping a coloured day shows its title and text | PENDING (device) | |

### Honest limits of the step 1.5 checks
- Streak uses the phone's current date and time zone; changing time zones can shift it by a day.
- Only one entry per day is shown in the calendar for now; if a day somehow has several, the latest edited one is shown.
- Day-of-entry dates are stored unencrypted (see step 1.3 limits), so the streak needs no decryption.

## Step 2.1 – Tags, past dates, edit, trash with 30-day restore

Written before the code. Cloud checks (G) run in Node with the real encrypted repository on a file. Device checks (H) need the iPhone.

**Changed requirement (decided before coding, logged here on purpose):** in step 1.4, check A5 said that emptying an entry "removes it". With trash available, emptying an entry now moves it to the trash instead (recoverable for 30 days), so an accidental select-all-delete is not a permanent loss. A5 and A7 in `editor.test.ts` are updated to count visible entries and also assert the entry is in the trash. The intent of A5 (nothing empty is shown or created) is unchanged. Discarding a brand-new entry still deletes it for good, since the user has not kept it.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 2.1 | G1: Tags round-trip inside the encrypted payload (also umlauts); the database file shows no readable tag; entries saved before tags existed load with no tags | PASS | `npm test`: test 31 ok (tags with umlauts; a payload from the older format loads with no tags; file bytes hold no readable tag) |
| 2.1 | G2: Tag cleaning: trimmed, leading # removed, inner spaces collapsed, duplicates ignored ignoring case (first spelling kept), empty ignored, at most 30 characters each and 10 per entry | PASS | `npm test`: test 32 ok |
| 2.1 | G3: A trashed entry disappears from the month list, the day list (streak) and the calendar; it shows in the trash list with its trash time; restore brings it back unchanged | PASS | `npm test`: test 33 ok |
| 2.1 | G4: Purge removes entries trashed 30 days ago or more, keeps those trashed 29 days ago, never touches entries that are not in the trash | PASS | `npm test`: test 34 ok (30 days gone, 29 kept, live entry untouched even a year later) |
| 2.1 | G5: Delete forever and empty trash remove the rows for good | PASS | `npm test`: test 35 ok |
| 2.1 | G6: A database from the v0.6 schema (no trash column) opens, keeps its entries and gains the column; preparing the schema twice is harmless | PASS | `npm test`: test 36 ok (real v0.6 schema created by hand, upgraded, entry kept, trash works) |
| 2.1 | G7: Editor: emptying an entry moves it to the trash; typing again restores the same entry (same id, one row); discarding a new entry deletes it for good; discarding after editing restores the original even if it had been emptied (A5 and A7 updated as logged above) | PASS | `npm test`: test 37 ok; A5 and A7 updated as logged |
| 2.1 | G8: An entry written for a past date in an earlier month is listed in that month only, with the right day | PASS | `npm test`: test 38 ok |
| 2.1 | G9: "Move to trash" from the editor saves pending text first, then trashes the entry; with no entry yet it does nothing | PASS | `npm test`: test 39 ok |
| 2.1 | G10: `npm test`, `npm run typecheck` clean; iOS bundle builds | PASS | `npm test` 47 of 47 pass; `npm run typecheck` exit 0; iOS bundle builds (1.8 MB) and contains no browser-harness code (grep for harness and sql-wasm: 0) |
| 2.1 | H1: Add two tags to an entry, leave and reopen it: the tags are still there | PASS (browser, iPhone-size) | `npm run e2e`: tags #family and #Work (duplicate "work" ignored) shown in editor and day preview; still there after page reload and unlock |
| 2.1 | H2: Move an entry to the trash: it leaves the calendar and appears in Trash with days left; Restore puts it back | PASS (browser, iPhone-size) | `npm run e2e`: entry left the calendar (0 entries), Trash showed "30 days left", Restore brought it back; Delete forever needs a second tap; screenshots 07-trash.png |
| 2.1 | H3: An entry for an earlier date can be written and shows on that day | PASS (browser, iPhone-size) | `npm run e2e`: wrote on the 15th of the previous month, counted there, absent from the current month |

### Honest limits of the step 2.1 checks
- The 30-day clock uses the phone's clock; purge runs when the diary is unlocked, not in the background.
- Tags live inside the encrypted entry, so they cannot be searched without decrypting entries; search in step 2.2 will decrypt on the device.
- Deleting forever overwrites nothing on the flash storage; SQLite may keep old pages until they are reused. Real secure erase is not possible from JavaScript.

### How the browser checks (H) were run
The H checks ran in headless Chromium at 390 x 844 (iPhone size) against the real screens, driven by `e2e/flow.mjs` (`npm run build:web`, serve the folder, `npm run e2e`). The browser build swaps two things for test-only stand-ins: sql.js for SQLite and localStorage for the keychain (files `*.web.ts`; they are not in the iOS bundle). So these checks prove the screens, flows and logic, not the iPhone itself. Still only provable on the iPhone: the real keychain, Face ID, expo-sqlite, real unlock speed and iOS app-switching.

## Step 2.2 – Search on the device, filters, Stream list

Written before the code. Search decrypts entries on the phone and matches there; nothing leaves the device. Cloud checks (Q) run in Node; the browser checks (B) run the real screens at iPhone size (see the note at the end of step 2.1).

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 2.2 | Q1: A query finds entries by words in title, text or tags; several words must all match, in any order; letter case and accents do not matter (cafe finds café); an empty query lists everything | PASS | `npm test`: test 23 ok (title, text, tag, accents, case, multi-word any order, blank query) |
| 2.2 | Q2: Mood filter (any of the chosen moods) and tag filter (exact, any letter case) work alone and together with a query | PASS | `npm test`: test 24 ok (mood sets, exact tag, combined with query) |
| 2.2 | Q3: Results are newest day first (ties by last edit); entries in the trash are never found | PASS | `npm test`: test 25 ok (order by day then last edit; trashed text not found) |
| 2.2 | Q4: The result snippet shows the text around the first match, is short, and falls back to the start of the text when only title or tag matched | PASS | `npm test`: test 26 ok |
| 2.2 | Q5: Tag list with counts, most used first, ties alphabetical, trashed entries not counted | PASS | `npm test`: test 27 ok |
| 2.2 | Q6: Loading all entries decrypts every one (none skipped); a search over 300 entries takes under 500 ms in Node | PASS | `npm test`: test 28 ok (299 entries decrypted, none garbled; trashed one excluded; load + search of 300 entries took 21 ms in Node) |
| 2.2 | B1 (TC-15): In the browser run, searching by a word in the text and by a tag finds the right entry, a mood filter narrows the list, a missing word shows "No entries found", tapping a result opens it for editing, and not a single network request is made while searching | PASS | `npm run e2e` check B1 passed: search "silence" found 1; "CAFE" found the entry with "café"; tag filter, mood filter, "No entries found"; tapping a result opened it and Done returned to the list; the request log recorded zero network requests during the search; screenshot 09-search.png |
| 2.2 | Q7: `npm test`, `npm run typecheck`, browser run and iOS bundle all clean | PASS | `npm test` 53 of 53 pass; `npm run typecheck` 0 errors; browser run 12 of 12 pass; iOS bundle builds (no harness code inside) |

### Honest limits of the step 2.2 checks
- Timing was measured in cloud Node, not on an iPhone; the phone will be slower. At very large diaries (many thousands of entries) a search index would be needed.
- Search keeps decrypted entries in memory only while the search screen is open and drops them when it closes or the diary locks.
- "No network requests" is proven in the browser run for the app's own screens; the iPhone's network traffic itself is not observed here.

### Found by the browser run during step 2.2
The browser run showed that with the new search button the lock button was pushed off the right edge of an iPhone-width screen. Fixed by moving the three icon buttons (search, trash, lock) to their own row above the month title; a permanent layout check (all header buttons fully inside 390 px) now guards this.

## Step 2.3 – Settings: auto-lock time, reminder (neutral wording), theme

Written before the code. Settings are not secret, so they are kept as one small JSON item in the same key store as the vault (iOS keychain on the phone), which also makes them readable before unlock (the theme shows on the passcode screen). Cloud checks (T) run in Node with a fake notifier; browser checks (B) run the real screens at iPhone size with a controllable clock.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 2.3 | T1: Settings load with defaults when nothing is stored; broken or tampered JSON falls back to defaults field by field; only allowed auto-lock values (0, 1, 5, 15 min), themes (system, dark, light) and valid reminder times (hour 0-23, minute 0-59) are accepted; save then load returns the same settings | PASS | `npm test`: T1 ok (defaults; garbage JSON, arrays and null repaired; bad hour/minute/lock/theme repaired field by field; invalid values never stored; round trip) |
| 2.3 | T2: Auto-lock setting maps to milliseconds (0 = lock as soon as the app leaves the foreground, default 5 min) and feeds the existing lock rules | PASS | `npm test`: T2 ok (0/1/5/15 min to ms; boundary behaviour of shouldLockOnIdle and shouldLockOnReturn at the 5 minute limit; limit 0 locks on any return) |
| 2.3 | T3 (TC-18): Reminder: turning it on asks permission and schedules exactly one daily notification at the chosen time; changing the time replaces it (never two); turning it off cancels it; refused permission schedules nothing and reports "denied"; the notification text contains none of: diary, journal, entry, private, secret, passcode | PASS | `npm test`: T3 ok (fake notifier: one notification at 20:30; replaced by 07:05; applying at every app start keeps exactly one; off cancels and asks no permission; denied and unsupported schedule nothing; text "A quiet moment / Take a minute for yourself." has none of the forbidden words) |
| 2.3 | T4: Theme: "system" follows the phone's light/dark setting, "dark" and "light" are fixed; both palettes define every colour; text on background, dim text on background, text on cards and accent button text all reach contrast 4.5:1 or better in both palettes | PASS | `npm test`: T4 ok. Measured contrast, dark / light: text on bg 15.5 / 13.9, dim text on bg 9.5 / 7.1, faint text on bg 7.4 / 5.1, dim on card 8.2 / 7.8, accent button text 10.3 / 5.9, accent on card 9.2 / 5.9 (all above 4.5) |
| 2.3 | B1: Settings screen opens from the calendar; auto-lock choice, theme and reminder switch are shown; choices persist after a page reload (also visible on the passcode screen for the theme) | PASS | `npm run e2e` S1 passed: all choices shown, default 5 min selected; chose 15 min, Light and reminder on; after reload the passcode screen was already light (computed background), and the three choices were still selected after unlock; in the browser the reminder shows "Reminders are not available here" (screenshots 10 and 11) |
| 2.3 | B2 (TC-13): With auto-lock 5 minutes the diary stays open after 4 minutes idle and is locked after 6 minutes idle (browser clock fast-forwarded); with 1 minute it locks after 90 seconds | PASS | `npm run e2e` S2 passed (browser clock fast-forwarded): 5 min setting: open at 4 min, locked at 6 min; 1 min setting: open at 30 s, locked at 90 s |
| 2.3 | B3: Light theme: the page background and text colours really change (computed from the screen), nothing is unreadable on any screen (screenshots of passcode, calendar, editor, search, trash, settings reviewed) | PASS | `npm run e2e` S3 passed (computed background is light on calendar); I reviewed the light screenshots of passcode, calendar and settings (10, 11, 12) and the search, editor and trash ones (13, 15, 14): readable, no clipped or invisible text. The trash screenshot shows the empty trash only; its entry cards use the same card styles as the search results, which I did review |
| 2.3 | T5: `npm test`, `npm run typecheck`, browser run and iOS bundle all clean | PASS | `npm test` 57 of 57 pass; `npm run typecheck` 0 errors; browser run 15 of 15 pass; iOS bundle builds (1.9 MB) with the notification code and without harness code |

### Honest limits of the step 2.3 checks
- Real iOS notification permission and delivery cannot be tested in the cloud or in the browser; logic is tested with a fake notifier. This is part of the final acceptance pass on the iPhone.
- Notification wording is neutral so a lock screen reveals nothing, but a daily notification at a fixed time still shows that some reminder exists.
- The auto-lock timing in the browser uses a fake clock; the iOS app-switch behaviour is still only provable on the iPhone.

### Found by the browser run during step 2.3
The selected/on state of the settings buttons was set with the old accessibilityState prop, which web (and so not reliably any screen reader there) did not expose. Changed to the standard aria-selected / aria-checked / aria-disabled props.

## Step 2.4 – Export (Markdown / JSON) and delete all data

Written before the code. Export decrypts on the phone and hands the user one plain file through the iOS share sheet (Save to Files, AirDrop, Mail). Delete-all wipes the database, then the keys and settings, and returns the app to first-time setup. Cloud checks (U) run in Node; the browser checks (E) run the real screens at iPhone size (in the browser, "share" becomes a file download so the content can be checked).

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 2.4 | U1 (TC-16): JSON export is valid JSON and holds every entry that is not in the trash with date, mood (number and name), title, text, tags, created and edited times, oldest first, plus export time and count; umlauts and emoji survive; trashed entries, keys and the passcode are not in it | PASS | `npm test`: U1 ok (valid JSON; 3 of 4 entries, trashed one absent; oldest first with same-day tie by creation time; umlauts, emoji, quotes, line breaks intact; no passcode/key/recovery/wrapped/salt words in the file; empty diary gives count 0) |
| 2.4 | U2: Markdown export has one section per entry (date, title or "Untitled", mood name, #tags, full text), oldest first; a title with line breaks or leading # cannot break the structure; an empty diary gives a friendly single line | PASS | `npm test`: U2 ok (exactly one "## " heading per entry even with a title of "# Sneaky\n## heading", which is flattened to one line; Untitled; mood and #tags line; text intact; order; empty diary says "There are no entries yet.") |
| 2.4 | U3: Export file names use the phone's local date (private-diary-YYYY-MM-DD.md / .json) | PASS | `npm test`: U3 ok (23:59 and 00:01 local, year end) |
| 2.4 | U4 (TC-17): Delete-all removes every entry including the trash, the recovery blob in the database and compacts the file: afterwards the database file contains no readable text and no sealed entry data (no "v1.<hex>" payload) | PASS | `npm test`: U4 ok (40 entries incl. one in trash and the recovery blob; after delete-all: 0 rows, file bytes contain no title or text, no "v1.<48 hex>." sealed payload, no wrappedByRecovery) |
| 2.4 | U5: Delete-all also removes the key bundle, attempt counter, Face ID item and settings: the vault reports "not set up", the old passcode no longer unlocks anything, and a fresh setup with a new passcode produces a different data key | PASS | `npm test`: U5 ok (bundle and counter gone from the key store, Face ID removal called, settings back to defaults, new setup gives a different data key, old passcode refused) |
| 2.4 | U6: If wiping the database fails, nothing else is removed (keys and settings stay), so the user is never left with a locked, undeletable diary | PASS | `npm test`: U6 ok (forced disk error: vault still set up, settings kept, Face ID untouched, 39 entries still readable) |
| 2.4 | E1: In the browser run, "Export as JSON" and "Export as Markdown" each download a file whose content matches the entries on screen, with an unencrypted-file warning shown first | PASS | `npm run e2e` E1 passed: warning shown before any export; Cancel produced no download; Markdown file (name private-diary-YYYY-MM-DD.md) had the title, text, #calm tag, moods and exactly 3 entry headings; JSON file had count 3, the right titles, the Heavy day entry with tag, mood 1 and its text, and no passcode/key words; screenshot 16-export-warning.png |
| 2.4 | E2: Delete all data needs the word DELETE typed (button disabled until then); afterwards the app shows passcode setup, a reload still shows setup, the old passcode is gone, and a new setup opens an empty calendar | PASS | `npm run e2e` E2 passed: button disabled for "DELET" and for lower-case "delete"; after DELETE the app showed "Create your passcode"; stored key bundle, counter and settings gone; reload still setup; new passcode flow opened a calendar with 0 entries, settings back to defaults (5 min, System), search empty; screenshot 17-delete-confirm.png |
| 2.4 | U7: `npm test`, `npm run typecheck`, browser run and iOS bundle all clean | PASS | `npm test` 63 of 63 pass; `npm run typecheck` 0 errors; browser run 17 of 17 pass; iOS bundle builds (2 MB), contains the share-sheet code and none of the browser stand-ins (the generic word createObjectURL appears once, which comes from React Native itself) |

### Honest limits of the step 2.4 checks
- The iOS share sheet, writing the temporary file with expo-file-system and saving to Files cannot be run in the cloud or browser; the content that goes into the file is fully checked. This is part of the final acceptance pass on the iPhone.
- The exported file is NOT encrypted. The app writes it to a temporary cache file, shares it, and deletes the temporary copy afterwards; wherever the user saves it, it is theirs to protect.
- Flash storage can keep old data pages after deletion. Compacting the database (VACUUM) removes them from the database file, but iOS gives no way to securely erase flash from an app. The strongest protection stays the encryption: after delete-all the keys are gone too, so any leftover sealed data cannot be read.

## Step 2.5 – Dictation through the iOS keyboard microphone

Written before the code. In-app dictation (our own screen with on-device recognition) needs the Apple Developer account and a development build, so it comes in Phase 3. Until then the free route is the microphone key on the iPhone keyboard, which works in any text field. This step also removes the prototype "dictation" screen that inserted a fixed sample text, because a made-up text in a real diary would be wrong.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 2.5 | M1: "Dictate" on the calendar opens the entry editor with the text field focused (keyboard up), shows a hint about the keyboard microphone, and inserts no text of its own; leaving without typing creates no entry | PASS | `npm run e2e` M1/M2 passed: Dictate opened the editor with the text field focused (active element is "Entry text"), hint visible, title and text empty, no sample words on screen; Discard and Done with nothing typed left 0 entries; Write also focuses the field; screenshot 18-dictation-hint.png |
| 2.5 | M2: The hint is visible while the text is empty and disappears once something is typed; it says that iOS (not this app) does the voice recognition and that audio handling depends on the iPhone's dictation settings | PASS | `npm run e2e` M1/M2 passed: hint hidden after typing "hello", back after clearing; text says "iOS does the voice recognition, not this app; whether audio stays on the phone depends on your iPhone's dictation settings" |
| 2.5 | M3: The prototype dictation screen and its sample text are gone from the app (no "Mara" or fixed sample anywhere in src, screen removed from navigation) | PASS | Voice.tsx deleted; grep for "Mara" in src and App.tsx finds it only in the encryption unit test's sample string (test data, not app code); the iOS bundle contains no "angry with Mara"; the 'voice' screen is gone from the Screen type and navigation |
| 2.5 | M4: `npm test`, `npm run typecheck`, browser run and iOS bundle all clean | PASS | `npm test` 63 of 63 pass; `npm run typecheck` 0 errors; browser run 18 of 18 pass; iOS bundle builds (2 MB) |
| 2.5 | F1 (final acceptance, iPhone only): tap the keyboard microphone in the editor, speak a sentence: the sentence appears in the text field and autosaves | PENDING (device) | |

### Honest limits of the step 2.5 checks
- The keyboard microphone belongs to iOS, so only the iPhone can prove it works (F1). The app uses a standard multi-line text field, which iOS dictation supports, and shows the hint; the microphone key only appears if Dictation is enabled in iPhone Settings > General > Keyboard.
- Whether iOS processes the audio on the phone or on Apple's servers depends on the language and iPhone settings; the app cannot control or observe this. The hint says so instead of promising privacy it cannot guarantee.

## Step 1.6 – Restore on a new phone (recovery key + stored recovery blob)

Written before the code. Situation: the iPhone is replaced and the diary database comes along (for example through an iPhone backup), but the key bundle in the keychain is "this device only" and does not. Since step 1.3 the database also holds an encrypted copy of the data key (wrapped by the recovery key). On the new phone the app must notice "entries are here but no keys" and offer to restore with the recovery key instead of silently starting a new, empty diary that hides the old data. Cloud checks (R) run in Node with real database files copied to a "new phone" (empty key store); the browser checks (B) run the real screens.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 1.6 | R1: With the recovery blob from the database and the right recovery key the original data key comes back and every entry of the copied database decrypts | PASS | `npm test`: R1 ok (12 entries with umlaut and emoji decrypt after the copy) |
| 1.6 | R2: A wrong or malformed recovery key is refused, counts toward the 5-tries limit and then the pause, and leaves the vault "not set up" and the blob untouched | PASS | `npm test`: R2 ok (4 then 3 tries left; after 5 the right key is refused during the pause and accepted after 31 s; vault still not set up; blob unchanged; garbage blob rejected) |
| 1.6 | R3: Finishing the restore with a new passcode creates a working key bundle: the new passcode unlocks the same data key, the recovery key still works, and a vault that is already set up cannot be overwritten by a restore | PASS | `npm test`: R3 ok (6-digit rule enforced; new passcode gives the same data key; phone A's passcode refused; recovery key still works; second restore or finish refused; data key not stored readable) |
| 1.6 | R4: The app offers a restore only when the vault is not set up AND the database holds a recovery blob (fresh install: no; vault already set up: no); reading the blob needs no key | PASS | `npm test`: R4 ok (new phone with database: yes; empty database: no; set-up vault: no) |
| 1.6 | R5: "Start a new diary instead" erases the old entries and blob and compacts the file; afterwards no sealed data or text is in the file, no restore is offered and a fresh setup works | PASS | `npm test`: R5 ok (0 rows, blob gone, file has no sealed payload and no wrappedByRecovery, fresh setup gives a different key) |
| 1.6 | R6: Whole path on real files: set up on "phone A" with entries, copy only the database file to "phone B" (empty key store), restore with the recovery key and a new passcode, read all entries back, lock, unlock with the new passcode | PASS | `npm test`: R6 ok (recovery key typed lower case with spaces accepted; 12 entries equal before and after an app restart; no restore offered afterwards; recovery key still opens the stored blob) |
| 1.6 | B1: In the browser run, after the keychain stand-in is emptied but the database kept, the app shows "Restore your diary"; a wrong recovery key shows an error; the right key leads to a new-passcode screen and then the calendar with the old entries; a reload and the new passcode unlock it | PASS | `npm run e2e` B1 passed: "Restore your diary" shown; wrong key gave "Wrong recovery key. 4 tries left"; right key (typed lower case) led to "Choose a new passcode", then the calendar with "Restore me" and its text; after reload the lock screen (no restore offered) refused the old passcode and accepted the new one; screenshot 19-restore-intro.png |
| 1.6 | B2: In the browser run, "Start a new diary instead" needs DELETE typed, then shows first-time setup with an empty diary | PASS | `npm run e2e` B2 passed: erase button disabled until DELETE typed; then "Create your passcode"; reload still setup (no restore); new setup opened an empty calendar without "Restore me" |
| 1.6 | R7: `npm test`, `npm run typecheck`, browser run and iOS bundle all clean | PASS | `npm test` 69 of 69 pass; `npm run typecheck` 0 errors; browser run 20 of 20 pass; iOS bundle builds (2 MB) with the restore screens and without browser stand-ins |
| 1.6 | F2 (final acceptance, only if a second iPhone or a backup restore is available): the real iPhone-backup route works, i.e. the SQLite file really is included in the backup | PENDING (device) | |

### Honest limits of the step 1.6 checks
- Whether iOS includes the app's SQLite file in a backup and puts it on the new phone is an iOS behaviour I cannot test here (F2). If it does not, a new phone starts empty and the export file from step 2.4 is the way to keep entries; an import function does not exist yet.
- Anyone who has the database file AND the recovery key can read the diary. That is by design: the recovery key is the master key. The passcode alone is not enough on a new phone.
- The recovery blob protects the data key only with the 52-character recovery key (256 bits of randomness), not with the passcode, so a weak passcode does not weaken it.

## Step 4.1 – Accessibility pass (what can be proven without an iPhone)

Written before the work. The browser run scans every screen of the real app at iPhone size. VoiceOver itself, Dynamic Type (large text) and real touch use can only be proven on the iPhone.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 4.1 | X1: Every button, switch and text field on every screen (passcode setup and unlock, recovery, restore, calendar, editor, search, trash, settings) has a name a screen reader can read | PASS | Browser scan (e2e "X1-X3"): 137 interactive elements on unlock, calendar, editor, search, trash, settings (reminder on, export panel, delete confirm) all have a name. Run 3x green. |
| 4.1 | X2: Every tappable element is at least 44 x 44 points | PASS | Same scan: every element is at least 43.5 px. It found real misses (title field 42 px, tag chips and filter chips 36 px, tag field 36 px); fixed to 44-48, re-run green. |
| 4.1 | X3: Every screen has a title marked as a heading | PASS | Same scan: every screen has a visible heading (added header roles on screen titles, month title, editor date, settings sections). |
| 4.1 | X4: Mood is never conveyed by colour alone: calendar days say the mood name in their label; the mood buttons in the editor and search say their name and whether they are selected | PASS | e2e: 5 named mood buttons, exactly one aria-selected in the editor; calendar day labels say "entry written, mood <name>" and ", selected"; search results say the mood name. |
| 4.1 | X5: Messages that appear by themselves (wrong passcode, save status, export result) are in live regions so a screen reader announces them | PASS | e2e: editor save status is found as a polite live region; live regions added for search count, export and delete messages (VaultFlow already had one). Announcement itself only provable with VoiceOver (A1). |
| 4.1 | X6: Contrast of both themes stays at 4.5:1 or better (test T4 still passes) | PASS | npm test: 69 pass incl. contrast test T4 (both themes). |
| 4.1 | A1 (final acceptance, iPhone only): VoiceOver reads each screen in a sensible order and every button can be used; the app stays usable at the largest text size | PENDING (device) | |

### Honest limits of the step 4.1 checks
- The scan reads the web version of the screens. React Native turns the same props into iOS accessibility properties, but only VoiceOver on the iPhone proves the reading order and wording.
- Text size: iOS Dynamic Type cannot be emulated in the browser run; layouts avoid fixed text heights, but a large-text pass on the phone is still needed (A1).

## Step 4.2 – Security self-review (not independent)

Written before the work. This is my own review of the code against a checklist; it is NOT an independent review and does not replace one. Rules that must hold every time are enforced by a script (`npm run audit`), not by good intentions.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 4.2 | Y1: `npm run audit` (static rules) passes: no network APIs in app code, no console logging of anything, only parameterised SQL, encryption libraries imported only inside src/crypto, secrets written to storage only through the vault and biometric modules | PASS | npm run audit: "AUDIT OK: 37 files, 6 rules, 0 findings". First run exposed nothing; an earlier manual grep showed biometric.ts importing @noble directly, fixed by re-exporting hex helpers from src/crypto. |
| 4.2 | Y2: The audit script is not vacuous: planted violations (a fetch call, a console.log, string-built SQL, a crypto import outside src/crypto, a secret written elsewhere) are each detected and make it fail | PASS | scripts/audit.test.mjs: 11 planted violations (fetch, WebSocket, URL literal, console.log, 2x string-built SQL, 2x crypto import outside src/crypto, 2x secret write elsewhere, clipboard) each detected, plus 1 allowed-code case = 12/12 pass. |
| 4.2 | Y3: `npm audit` for production dependencies has no high or critical findings that affect this app, or each one is explained | PASS | npm audit --omit=dev: 23 findings (15 high, 8 moderate), all in build tooling (expo cli, metro, node-forge, braces, xcode, uuid). iOS bundle source map (783 modules, 41 packages) contains none of them. Explained in security-review.md. |
| 4.2 | Y4: A written review (security-review.md) lists every finding with severity and status (fixed, accepted with reason, or open); nothing is left unstated | PASS | security-review.md lists F1-F14 with severity and status; open items stated (F3, F12, F13, F14). |
| 4.2 | Y5: `npm test`, `npm run typecheck`, browser run and iOS bundle all clean after any fixes | PASS | After fixes: npm test 69/69, typecheck 0 errors, audit OK, browser 21/21 (3 clean runs earlier, 1 clean after), iOS export succeeds with no *.web or harness modules in the bundle. |
| 4.2 | I1 (open by nature): independent security review by another person | PENDING (external) | |

### Note on browser stability
One run of the S2 auto-lock check timed out once (it uses a simulated clock under CPU load); 4 later full runs were all green. Not changed or weakened.

## Step 4.5 – Stronger passcode option (security finding F3)

Written before the work. Goal: besides 6 digits, the person can choose a passphrase of at least 10 characters at setup, when changing the passcode and when restoring. The unlock screen shows the type that was chosen. The attempt limit, recovery key and encryption are unchanged.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 4.5 | P1: A valid passcode is exactly 6 digits OR a passphrase of 10 to 128 characters; 9 characters, 5 digits and 129 characters are refused | PASS | passphrase.test.ts P1: 6 digits and 10 to 128 characters accepted; 9 chars, 5 digits, 129 chars refused. |
| 4.5 | P2: Weak passphrases are refused: one repeated character, fewer than 5 different characters, only digits that form a run | PASS | passphrase.test.ts P2: repeated char, <5 distinct, repeated words, digit runs (incl. 1234567890 and 9876543210) refused; ordinary phrases accepted. |
| 4.5 | P3: Setup with a passphrase, then unlock with it works; a wrong passphrase fails and counts toward the 5 tries and the pause; `getPasscodeKind` says "phrase" (and "pin" for digits) | PASS | passphrase.test.ts P3: setup/unlock with phrase, passphrase not in stored data, 4 tries left after one wrong, pause after 5, kind "phrase"/"pin". |
| 4.5 | P4: Changing from digits to a passphrase and back updates the kind; a restore on a new phone accepts a passphrase | PASS | passphrase.test.ts P4: pin to phrase to pin switch updates kind; restore on a second store accepts a phrase. |
| 4.5 | P5: The same passphrase typed with a different Unicode form (e.g. é as one character or as e + accent) unlocks | PASS | passphrase.test.ts P5: NFKC normalisation, e as one char vs e + accent unlocks. |
| 4.5 | P6: Browser: setup with a passphrase, restart, the unlock screen shows a text field (not the digit pad); wrong passphrase shows tries left; right one opens the diary; digit users are unaffected (all earlier browser checks still pass) | PASS | e2e P6/P7 (22 browser checks): weak and mismatching phrases refused; restart shows text field, no digit pad; wrong phrase "4 tries left"; right phrase opens. Earlier 21 checks (digit flow) unchanged and green. |
| 4.5 | P7: Accessibility scan (names, 44 pt, headings) passes on the passphrase screens | PASS | Same e2e check runs the accessibility scan on create, confirm and unlock passphrase screens: names, 44 pt, headings clean. |
| 4.5 | P8: `npm test`, typecheck, audit, browser run, iOS bundle clean | PASS | npm test 74/74, typecheck 0 errors, audit OK (12/12 audit tests), browser 22/22 in 11 of 13 runs, iOS bundle exports (2 MB), no harness code. |
| 4.5 | D6 (iPhone): the passphrase field uses the keyboard without autocorrect or suggestions leaking the phrase; unlock time with a passphrase is under 3 s (same Argon2 cost as digits) | PENDING (device) | |

### Note on browser stability (updated)
The S2 auto-lock check (simulated clock) timed out in 2 of 13 full runs, both right after a heavy build command in the same machine; 11 other runs were green, including 8 in a row. It was not changed. If it fails again on a quiet machine, treat it as a real bug. The failure output now prints the failing line.

## Step 5.1 – German interface

Written before the work. English text stays the key (`t('Settings')`), German comes from a dictionary. Language setting: Device (default) / English / Deutsch, stored with the other settings. The diary content itself is never translated.

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 5.1 | L1: `translate` returns the English text without a dictionary hit, the German text when language is German, fills `{name}` placeholders, and falls back to English for an unknown key | PASS | i18n.test.ts L1: English default, German "Einstellungen", placeholders filled, unknown key falls back, unknown placeholder stays visible. |
| 5.1 | L2: Completeness test scans all source files: every text passed to `t()` has a German entry; no German entry is unused; placeholders match between English and German; no German text equals the English one (except a short allow-list of names) | PASS | i18n.test.ts L2: scan of App.tsx and src found >100 texts; all have German entries (219 entries); none unused; placeholders match; none left untranslated except an allow-list of names/loanwords (System, English, Deutsch, Okay, ...). |
| 5.1 | L3: Language setting (device / English / Deutsch) is stored and loaded; device language German selects German, anything else English | PASS | i18n.test.ts L3: de, de-DE, de_AT select German; en-US, fr-FR, "dev-DE", undefined select English; stored setting parsed and invalid values fall back to "system". |
| 5.1 | L4: German month names, weekday names and mood names appear in the calendar, editor, search and trash; reminder notification text is German when German is selected | PASS | i18n.test.ts L4: March = März, Thursday = Donnerstag, Mon = Mo, Very low = Sehr schlecht; reminder text German with no forbidden words in either language; German Markdown export ("Stimmung: Gut", Oktober, Ohne Titel). |
| 5.1 | L5: Browser, German locale: every screen (setup, recovery key, unlock, restore, calendar, editor, search, trash, settings with its panels) shows no untranslated English UI text (visible texts compared against the English keys), and the accessibility scan (names, 44 pt, headings) and the layout bounds check still pass with the longer German text | PASS | e2e L5 (locale de-DE): walked 18 screens/panels (setup, passphrase setup, confirm, recovery key, calendar, editor, search, trash, settings with reminder/export/delete panels, locked, wrong code, recovery entry, restore, new diary); no untranslated English (checked against dictionary + English word list); names/44 pt/bounds/headings pass with German text. Mutation check: un-translating one label made it fail. Screenshots viewed (calendar, settings). |
| 5.1 | L6: Browser, English locale: all earlier 22 checks still pass; switching the language in Settings changes the screen at once and survives a reload | PASS | e2e: all 22 earlier checks pass in English; L6 switches to Deutsch in Settings, screen changes at once, survives reload and unlock, Gerät returns to English. |
| 5.1 | L7: `npm test`, typecheck, audit, iOS bundle clean | PASS | npm test 80/80, typecheck 0 errors, audit OK (40 files, 12/12), iOS bundle exports (2 MB), browser 24/24. |
| 5.1 | D7 (human): a German speaker reads the translation for tone and mistakes (the translation is by Claude, not a professional translator) | PENDING (human) | |

### Decisions and limits of step 5.1
- The word to type for destructive confirmations stays DELETE in both languages (one rule in the code; the German text says so).
- Export: Markdown follows the app language; JSON keeps fixed English field names so other tools can read it.
- Test change (logged, not weakened): the settings test fixture gained the new language field.
- Translation is by Claude, not a professional translator: D7 needs a German speaker to read it. Wording choices to confirm: "Code" for passcode, "Wiederherstellungsschlüssel" for recovery key, "Serie" wording ("Schreibserie").

## Step 5.2 – Import from a file

Written before the work. Settings > Your data gets "Import from a file". It reads the JSON export of this app (format 1) and adds the entries to the diary. Entries whose id already exists (also in the trash) are skipped, nothing is ever overwritten. Markdown exports cannot be imported (they lose information).

| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 5.2 | M1: A file made by `exportJson` is read back into the same entries (id, day, mood, title, text, tags, created and updated time) | PASS | import.test.ts M1: exportJson then parseImport gives identical entries (id, day, mood, title, text, tags, timestamps). |
| 5.2 | M2: Not JSON, a different app, a different format number, no entries list, or a file over 20 MB are refused with a reason; a single bad entry (invalid date, missing id or text) is skipped and counted while the others are kept; an out-of-range mood becomes 3; tags are cleaned (at most 10, 30 characters) | PASS | import.test.ts: 6 refusal reasons (not-json, wrong-app x2, wrong-format, no-entries, too-big, too-many); 9 bad entries skipped and counted (bad dates incl. 2026-02-30, empty/odd ids, non-string text, 200k+ text, duplicate id, non-objects); mood 9 becomes 3; tags capped at 10 x 30 chars; missing timestamps fall back. |
| 5.2 | M3: Import into the repository: new entries are stored encrypted with their original day and times; existing ids (visible or in the trash) are skipped and keep their content; the count of added and skipped is right | PASS | import.test.ts M3: rows stored encrypted (no readable text), original day and times kept; known ids (changed and trashed ones) skipped, local content untouched; counts {added, skipped} correct; newIds preview correct. |
| 5.2 | M4: Import is all or nothing: if storing fails half-way, no entry from that file remains | PASS | import.test.ts M4: an insert failing on the 2nd entry rolls back; 0 entries visible or in trash. |
| 5.2 | M5: Full round trip: export from one diary (own key), import into a fresh diary (other key): same entries; the stored rows contain no readable text | PASS | import.test.ts M5: export from one key imported into a diary with another key gives identical entries. |
| 5.2 | M6: Browser: choose a file; the preview says how many entries are new; confirm adds them and the calendar shows them; the same file again says nothing is new and changes nothing; an invalid file shows a message; German texts; accessibility scan passes on the import panel | PASS | e2e M6 (25 browser checks): file chosen through the file chooser; "Found 3 entries, 3 of them new" plus 1 unreadable skipped; scan clean on the panel; import adds 3 (calendar shows 2 this month, search finds the word, 3 total); same file again says "Nothing new to import" with no button; wrong app, not JSON and wrong format are refused with messages; German texts shown. Found and fixed a harness-only bug (sql.js export ends a transaction). |
| 5.2 | M7: `npm test`, typecheck, audit (no network; the picker is only a file chooser), iOS bundle clean, `npm audit` shows no new finding that ships in the app | PASS | npm test 88/88, typecheck 0 errors, audit OK (43 files), iOS bundle exports with expo-document-picker and no *.web stand-ins; npm audit: same 23 build-tool advisories as before, none new. |
| 5.2 | D8 (iPhone): the Files picker opens, can read a JSON file from "On My iPhone" and iCloud Drive, and the import works | PENDING (device) | |

## Phase 6 – check tables (written before each step's work)

### Step 6.1 – On This Day
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.1 | O1: `repo.listOnDay(month, day, beforeYear)` returns entries of earlier years on that month and day, newest year first; trashed entries, the current year and other days are excluded; 29 February is handled | PASS | onThisDay.test.ts: earlier years only, same month/day, newest year first; trashed, other days, other months, current year excluded; 29 Feb matches only 29 Feb. |
| 6.1 | O2: The query decrypts only matching rows (no full-diary decrypt) | PASS | onThisDay.test.ts O2: one SELECT, returned rows equal the matches (3 of 10), nothing else read. |
| 6.1 | O3: Browser: with entries from last year and two years ago on today's date, the calendar shows "On this day" with both, years in order; without such entries nothing is shown; tapping a card opens that entry; German text; accessibility scan passes | PASS | e2e O3 (26 browser checks): hidden with no older entries; after importing entries from last year and two years ago the "On this day" card shows both (newest first); tapping opens the entry text; German "An diesem Tag"; scan clean. Found and fixed a real crash (hook above early return, React #310). |
| 6.1 | D9 (iPhone): shown for the selected day too | PENDING (device) | |

### Step 6.2 – Writing templates
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.2 | W1: Four templates (Gratitude, Evening review, Stoic, Bullet journal) exist in English and German; inserting one into an empty entry fills the text and sets the cursor to the editor; inserting into text that already exists appends below and never replaces | PASS | templates.test.ts (unit) and e2e W1-W3: four buttons, empty fills, existing text appended |
| 6.2 | W2: The inserted text is saved by autosave like typed text | PASS | e2e: "Saved and encrypted" after insert; entry text present on the calendar |
| 6.2 | W3: Browser: template buttons appear in the editor, work, pass the scan; German texts | PASS | e2e W1-W3 (30/30 run), German "Vorlage Dankbarkeit einfügen"; scan passes |

### Step 6.3 – Insights
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.3 | I1: `computeInsights(entries, today)` gives: total entries and words, average words, longest and current streak, entries per month (last 12), mood average per week (last 12 weeks), mood distribution, top tags with entry count and average mood; correct on a hand-checked sample and on an empty diary | PASS | insights.test.ts hand-checked sample and empty diary (npm test 102/102) |
| 6.3 | I2: Words are counted in any language (letters and digits runs; umlauts, accents and emoji do not break it) | PASS | insights.test.ts: umlauts, accents, emoji |
| 6.3 | I3: Browser: Insights opens from the calendar, shows the numbers and bar charts for the sample diary; every chart has a text list with the same numbers for screen readers; empty diary shows a calm "Write a few entries first" text; German; scan passes; all computed on the device (no network request) | PASS | e2e I3: numbers, text label on each chart, 0 network requests; screenshot insights.png viewed |

### Step 6.4 – Search date filter
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.4 | R1: `searchEntries` accepts a range (from, to as day strings); inclusive; combines with word, mood and tag | PASS | search.test.ts range tests (inclusive, combined) |
| 6.4 | R2: Browser: presets Any time, 7 days, 30 days, This year change the result list and the count; German; scan passes | PASS | e2e R2: counts for 7 days / 30 days / this year / any time; screenshot viewed |

### Steps 6.5 and 6.6 – Markdown preview and backlinks
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.5 | K1: The renderer turns headings (#, ##, ###), **bold**, *italic*, > quotes, - and 1. lists and blank-line paragraphs into blocks; it never produces HTML or runs anything; unknown syntax stays plain text; unclosed markers stay as typed | PASS | markdown.test.ts (npm test) |
| 6.5 | K2: The stored text is exactly what was typed (the preview changes nothing); Edit/Preview toggle in the editor | PASS | e2e K5: Preview toggle; the editor text field is unchanged (stored text only changes through typing) |
| 6.6 | K3: `[[Title]]` is found in text; matching is case-insensitive against entry titles; the preview shows existing targets as links and missing ones as plain brackets; several entries with the same title: the newest is used | PASS | markdown.test.ts resolveLink; e2e K5: Target note is a button, Missing one stays plain brackets (screenshot preview.png viewed) |
| 6.6 | K4: "Linked from" lists entries whose text links to this entry's title; trashed entries are ignored | PASS | markdown.test.ts linkedFrom (trashed ignored); e2e K5: Linked from opens the source entry |
| 6.6 | K5: Browser: toggling Preview shows formatted text; tapping a link opens the target entry; Linked-from list works; German; scan passes | PASS | e2e K5 in the 30/30 run: preview formatted, link opens target, Linked from works, German "Vorschau", scan passes |

### Step 6.9 – Exports: plain text, Word (.docx), PDF
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.9 | X1: `exportText` gives readable plain text: date, title, mood, tags, text; oldest first; no trash; app language | PASS | formats.test.ts X1 (English, German, empty, order, no trash) |
| 6.9 | X2: `exportDocx` returns bytes of a valid .docx (zip with [Content_Types].xml, _rels/.rels, word/document.xml); python-docx opens it and finds every entry's title and text, with umlauts/emoji/XML characters (& < > ") intact; no trash | PASS | formats.test.ts X2: python-docx 1.2.0 opens the file, Title/Heading 2 styles, umlauts, emoji, & < > " intact, control characters removed, empty diary ok |
| 6.9 | X3: `exportHtml` (source of the PDF) escapes all entry text (a title like `<script>` stays text), has a title and is the same in the app language; no trash | PASS | formats.test.ts X3: script/markup escaped, lang attribute, no external URL |
| 6.9 | X4: Zip writer: CRC32 correct for known vectors; archive readable by Python zipfile (testzip OK) | PASS | formats.test.ts X4: CRC32 of "123456789" = cbf43926; Python zipfile testzip OK |
| 6.9 | X5: Settings offers Plain text, Word, PDF next to Markdown and JSON; names in German; accessibility scan passes; all temporary files deleted after sharing (code path same as before) | PASS | e2e X5 (32/32 run): five formats offered, warning shown, txt/docx/pdf-html downloads contain the diary; scan clean |
| 6.9 | D10 (iPhone): Word file opens in Pages/Word; PDF renders with umlauts and emoji; share sheet works | PENDING (device) | |

### Step 6.10 – Importers: Daylio CSV and Day One JSON
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.10 | Y1: Daylio CSV (columns full_date,date,weekday,time,mood,activities,note_title,note; quoted fields with commas, quotes and line breaks) is parsed; moods rad/good/meh/bad/awful map to 5..1; activities become tags; day from full_date; title/note kept | PASS | others.test.ts Y1 (synthetic Daylio sample with quotes, commas, line breaks, same-day merge) |
| 6.10 | Y2: Day One JSON (entries[] with uuid, creationDate, text, tags; first "# line" becomes the title; escaped markdown like `\.` is un-escaped) is parsed; entries without text are skipped and counted | PASS | others.test.ts Y2 (synthetic Day One sample, time zone, unescape) |
| 6.10 | Y3: Ids are stable (same file twice adds nothing the second time); malformed rows are skipped and counted; size limits as for the own format; nothing is executed | PASS | others.test.ts Y2/Y3: stable ids; invalid counted; ids fit storage rule; >20 MB refused |
| 6.10 | Y4: Source is detected from the content (own JSON, Day One JSON, Daylio CSV); anything else is refused with a clear message | PASS | others.test.ts Y4: own JSON still works; wrong-app / wrong-csv / not-json refusals |
| 6.10 | Y5: Browser: a Daylio CSV and a Day One JSON import through the same preview/confirm screen; German; scan passes | PASS | e2e Y5: Daylio and Day One preview + import, repeat adds nothing, found by search, German help text, scan clean |
| 6.10 | D11 (human): try with a REAL Daylio / Day One export (formats built from public documentation and synthetic samples only) | PENDING (human) | |

### Step 6.7 – Photo attachments (encrypted)
Design: photo bytes are sealed with the data key (XChaCha20-Poly1305, AAD "photo:<id>") in a separate `photos` table (id, entry_id, payload); the entry (sealed JSON) lists only photo ids. Photos are shrunk to 1600 px JPEG on the phone (this also drops camera metadata). At most 10 photos per entry, each at most 4 MB after shrinking. Exports contain text only (the app says so).
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.7 | P1: `encryptBytes/decryptBytes` round-trip any bytes; wrong key, wrong photo id and any changed byte fail with CORRUPT/WRONG; sealed text contains no plaintext bytes | PASS | photos.test.ts P1 (round trip, wrong key, wrong id, flipped byte, entry blob rejected, empty bytes) |
| 6.7 | P2: Repository: add/get photo; link on entry create and update; deletePermanently, emptyTrash, purgeExpired and wipeAll remove the photo rows; trash keeps them and restore brings the entry back with them; unlinked photos are purged at unlock; `prunePhotos(entryId, keep)` removes only the others | PASS | photos.test.ts P2: link on save, no takeover by another entry, prune, trash/restore, purgeExpired, emptyTrash, unlinked purge, wipeAll; P2b: stored file has no photo bytes, JPEG signature or marker |
| 6.7 | P3: Limits: 11th photo and a photo over 4 MB are refused (nothing stored); ids read back from an entry are validated (garbage dropped) | PASS | photos.test.ts P3: 11th photo, >4 MB and empty refused with nothing stored; exactly 4 MB as 10th accepted; garbage ids/place dropped; wrapper handles cancel, not-image, error |
| 6.7 | P4: base64 helper correct for all lengths 0..5 and a known vector | PASS | photos.test.ts P4 (lengths 0..6, all 256 byte values, JPEG/PNG detection) |
| 6.7 | P5: Editor: an entry with only a photo is not "empty" (not trashed); discard of a new entry removes its photos; discard of an existing entry keeps its original photos and removes the ones added in the session | PASS | photos.test.ts P5 (photo-only entry kept; discard keeps original photos and removes session photos; finish prunes; new entry discard removes photos) |
| 6.7 | P6: Browser: Add photo (file chooser) shows a thumbnail that really decodes (naturalWidth > 0), survives close and reopen, can be removed; the 11th photo shows a message; every control has a name and 44 pt; German; scan passes | PASS | e2e P6-P7/L2 (33/33 run): thumbnail decodes (naturalWidth>0), reopen, enlarge/close, ten photos then the Add button is hidden (so an 11th cannot be started; the message exists for a race), non-picture refused, remove brings the button back, German, scan clean; screenshot viewed. Editor body now scrolls as a whole (found by the scan: text field squeezed to 19 px) |
| 6.7 | P7: The stored database in the browser harness contains no readable JPEG bytes (search the persisted DB for the JPEG signature and the sample's marker text) | PASS | e2e: stored database (localStorage base64) contains no PNG signature, no marker text, no entry text, no coordinates |
| 6.7 | D12 (iPhone): picker opens (permission text shown), shrinking works, 10 photos stay responsive, camera location metadata is not kept | PENDING (device) | |

### Step 6.8 – Location tag (coordinates only)
Design: optional per entry, taken from the phone's GPS only when the person taps "Add location" (while using the app); stored inside the sealed entry as latitude/longitude rounded to 3 decimals (about 100 m). No place names (they would need a network service), no map.
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 6.8 | L1: `cleanPlace` accepts finite lat -90..90 / lon -180..180, rounds to 3 decimals, drops anything else; read back through the repository | PASS | photos.test.ts L1 (validation, rounding, N/S/E/W format, stored through the repository) |
| 6.8 | L2: Browser (geolocation granted to the test page): Add location shows the rounded coordinates, saved with the entry, shown again after reopen, Remove location clears it; denied permission shows a calm message and changes nothing; German; scan passes | PASS | e2e P6-P7/L2: coordinates shown, kept after reopen, removed, denied permission shows message and changes nothing, allowed again works, German, scan clean |
| 6.8 | L3: No network request is made by the feature; `npm run audit` still passes | PASS | e2e: 0 network requests during photo and location use; npm run audit 58 files 0 findings |
| 6.8 | D13 (iPhone): permission prompt text, real coordinates | PENDING (device) | |

| 6.7 | D14 (iPhone): the editor now scrolls as a whole; typing a long text with the keyboard open keeps the caret visible; Add photo and the thumbnails are easy to reach | PENDING (device) | |

### Step 7.1 – Several entries on one day (calendar)
Problem found in the review of open items: the calendar showed the last entry of a day but "Edit" opened the first, and the others were unreachable from the calendar.
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| 7.1 | M1: `groupByDay` lists each day's entries newest-updated first; the primary entry (preview and Edit) is the same one; trashed entries are not given | PASS | dayEntries.test.ts M1 |
| 7.1 | M2: Browser: a day with two entries shows the newest as preview, lists the other under "More entries on this day" and opens it; "Add another entry" creates a third without touching the others; each opens with its own text (no state leaking between entries of one day); German; scan passes | PASS | e2e M2 (34/34 run): newest is the preview, other entries listed and opened with their own text, third entry added, Edit opens the shown one, German, scan clean. Also fixed: Review is keyed by entry id, not by day |

## iPhone acceptance (2026-10-11)
User report: "App tested on iPhone" / "It works" (Expo Go, v0.17). General acceptance only; no per-item details given, so D9-D14, D7, I1, D11 stay listed as not individually evidenced.
Follow-up from user (2026-10-11): "Tried all features" on iPhone; all working per user report. Device items D7, D9-D14, I1, D11 accepted on user report (no screenshots or logs).

## Phase 7 – Web app (checks written before the work)
| Step | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| W1 | W1.1: Entries, settings and the key bundle survive a full page reload and a new browser page in the same profile (IndexedDB), and nothing diary-related is left in localStorage | PASS | e2e/web.mjs W1.1: reload + second page keep data, localStorage empty, keys in IndexedDB |
| W1.2 | A diary with 12 photos of 1 MB each saves and reloads (above the old 5 MB localStorage limit) | PASS | e2e/web.mjs W1.2/W1.3: 12 photos, database > 5 MB, reloads, thumbnails decode |
| W1.3 | The stored database in IndexedDB contains no readable entry text or JPEG bytes | PASS | same check: stored database has no JPEG signature, entry text or title |
| W1.4 | Writes made just before the tab is hidden are saved (reload right after typing keeps the text) | PASS | e2e/web.mjs W1.4: reload straight after "Saved" keeps the text (save confirms only after IndexedDB write) |
| W2 | W2.1: On the web, Settings shows no Face ID or reminder switch, only a short note; no control is broken; accessibility scan passes | PASS | e2e/web.mjs W2.1 (no reminder switch, no Face ID, notes shown); flow.mjs X1-X3 and German walk updated and pass |
| W2.2 | A 12-megapixel photo is shrunk to at most 1600 px JPEG in the browser before it is stored | PASS | e2e/web.mjs W2.2: 4000x3000 picture stored as JPEG with longer side 1500-1600 px |
| W2.3 | Export as PDF opens the browser print dialog with the entries (print called once, content contains the entry text) | PASS | flow.mjs X5: Export as PDF hands the escaped entries page to the print dialog (iframe srcdoc read by the test; the native dialog itself cannot be shown headless) |
| W2.4 | The diary locks after the idle limit when the tab was hidden (simulated visibilitychange + clock) | PASS | e2e/web.mjs W2.4: hidden + 70 min clock skew locks on return |
| W3 | W3.1: manifest.webmanifest is valid (name, start_url, display standalone, 192/512/maskable icons exist and load); apple-touch-icon present | PASS | scripts/pwa.test.mjs W3.1 + e2e/web.mjs W3.1 (manifest, 4 icon files load, apple tags) |
| W3.2 | After the first load the app opens offline (network cut) and unlocks and works | PASS | e2e/web.mjs W3.2: network off, reload, unlock, entry visible, new entry saved; also under /private-diary/ |
| W3.3 | CSP meta blocks all other sites (connect-src 'self': the app's own wasm file must load, so 'none' is impossible; the check's aim, no contact with any other host, is unchanged and tested with a probe); zero CSP violations and zero requests to other hosts while using every screen | PASS | pwa.test.mjs W3.3 (policy text, worker has one fetch(req) and checks origin) + e2e/web.mjs W3.3 (0 foreign requests, 0 violations, probe to another site blocked) |
| W3.4 | A new build replaces the old cached files (service worker version changes, old cache removed) | PASS | pwa.test.mjs W3.4: cache version follows content; file list exact (browser update flow itself not run) |
| W4 | W4.1: DEPLOY.md steps are complete and each command has been run here where possible; GitHub Pages workflow file is valid YAML; build works with a sub-path base URL (`/private-diary/`) | PASS | pwa.test.mjs W4.1 (_headers); pages.yml parsed as YAML; sub-path build /private-diary passes all 10 web checks; the host steps themselves were not run (need the user accounts) |
| W4.2 | Manual (HTML, PDF, DOCX) and INSTALL text describe the web app install on iPhone and the Expo Go route; screenshots still match | PENDING |  |
| W5 | W5.1: npm test, typecheck, audit all pass; e2e old 34 checks still pass against the new build | PASS | npm test 118, audit 60 files 0 findings + 16 script tests, typecheck clean, e2e 34/34 and web 10/10 |
| W5.2 | iOS export bundle contains no IndexedDB/service-worker/web stand-in code | PASS | expo export ios --dump-sourcemap: 0 hits for src/web/idb, expoDb.web, secureStore.web, sql.js, pickPhoto.web, indexedDB |
| W5.3 | D15 (user, iPhone Safari): Add to Home Screen works, opens full screen, works in airplane mode, data still there next day | PENDING (device) | |
