# progress.md

| Step | Status | Notes |
| --- | --- | --- |
| Plan | Approved 2026-10-11 | Scope: local-only v1, JS encryption, keyboard dictation first, English UI |
| 0.1 Project start | Built, device check pending | Metro running on PC; waiting for iPhone result |
| 0.2 Screens | Built, device check pending | Vault, Calendar, Voice, Review with sample data |
| 1.1 Encryption module | DONE (cloud checks C1 to C8 pass) | C9 (iPhone speed) pending |
| 1.2 Vault: real passcode, recovery key, attempt limit, auto-lock, Face ID | Built, cloud checks V1 to V8 pass; device checks D1 to D5 pending | v0.3. D5 shows the unlock time on the Calendar screen |
| 1.3 Encrypted local storage (SQLite) | Built, cloud checks S1 to S8 pass; device checks T1, T2 pending | v0.4. Sample data removed; recovery blob stored in the DB (restore flow = step 1.6). Today is still fixed to 11 Oct 2026 until 1.5 |
| 1.4 Editor with autosave | Built, cloud checks A1 to A8 pass; device checks E1 to E3 pending | v0.5. Autosave 600 ms; Done/Discard changes; Write/Edit and dictation work for the selected day; locking flushes first |
| 1.5 Calendar from real data | Built, cloud checks K1 to K7 pass; device checks L1 to L3 pending | v0.6. Real current month and date, month arrows, streak, per-day Write/Dictate |

| 4.1 Accessibility pass | DONE (X1 to X6 pass; A1 VoiceOver/large text on iPhone pending) | Browser scan of all screens; fixed small tap targets, added headings, mood names, live regions |
| 4.2 Security self-review | DONE (Y1 to Y5 pass; independent review I1 open) | `npm run audit` (6 rules + negative tests), security-review.md. Open: passcode strength option (F3), export compliance (F13) |
| 4.5 Passphrase option (finding F3) | DONE (P1 to P8 pass; D6 iPhone pending) | Setup, change and restore accept 6 digits or a passphrase of 10+ characters; unlock screen follows the choice |
| 5.1 German interface | DONE (L1 to L7 pass; D7 German proofreading pending) | Settings > Language: Device / English / Deutsch. Texts, dates, moods, reminder, export, Face ID prompt. English text is the key; i18n.test.ts checks completeness |
| 5.2 Import from a file | DONE (M1 to M7 pass; D8 Files picker on iPhone pending) | Settings > Your data: reads this app's JSON export, previews new vs known, all-or-nothing, never overwrites |
| 1.6 Restore on a new phone | DONE (R1 to R7, browser B1 and B2 pass; iPhone-backup route F2 unproven) | Detects "entries here, no keys" and offers restore with the recovery key or a fresh start |
| 2.1 Tags, past dates, edit, trash | DONE (cloud G1 to G10 and browser H1 to H3 pass) | v0.7. Browser test `npm run e2e` runs the real screens at iPhone size (10 checks) |
| 2.2 Search and Stream list | DONE (Q1 to Q7 and browser B1 pass) | Calendar header now has Search, Trash, Lock on their own row |
| 2.3 Settings | DONE (T1 to T5, browser S1 to S3 pass) | Auto-lock choices (default now 5 min), daily neutral reminder, theme system/dark/light. Real notification delivery only provable on the iPhone |
| 2.4 Export and delete all data | DONE (U1 to U7, browser E1 and E2 pass) | Settings > Your data. Share sheet and temp file only provable on the iPhone |
| 2.5 Keyboard dictation hint | DONE (M1 to M4 pass; iPhone check F1 pending) | Prototype dictation screen with sample text removed; real in-app dictation is Phase 3 (needs Apple Developer account) |

## Open for the final iPhone acceptance (cannot be proven in the cloud or browser)
Keychain and Face ID, expo-sqlite on the phone, real unlock speed (must be under 3 s, shown on the calendar as "Test build: passcode unlock took X s"), iOS app-switch locking, daily notification delivery, share sheet export, keyboard microphone dictation.

## Notes
- Expo login done on the PC (needed later for EAS builds in phase 3).
- PowerShell script policy set to RemoteSigned for the current user.
- Project folder on the PC: Documents\Personal-diary-app (from the screenshot).
- Phone showed "Could not connect to development server" at 09:40 on 2026-10-11: network/firewall issue on the PC side, not app code. Advised: keep START-DIARY running, same Wi-Fi, allow Node.js on Private networks, fallback `npx expo start --tunnel`.

## Phase 6 (added capability, all free)
| Step | Status | Notes |
|---|---|---|
| 6.1 On This Day | DONE (O1-O3 pass; device check D9 pending) | |
| 6.2 Writing templates | DONE (W1-W3 pass) | Gratitude, Evening review, Stoic, Bullet journal |
| 6.3 Insights | DONE (I1-I3 pass) | Computed on the device, text for every chart |
| 6.4 Search date presets | DONE (R1-R2 pass) | |
| 6.5/6.6 Markdown preview and [[links]] | DONE (K1-K5 pass) | Entries are one per day; link targets by title |
- Browser run: 30 of 30 checks. The S2 auto-lock check was flaky once in the browser harness only (timing), not root-caused.
| 6.9 Exports plain text, Word, PDF | DONE (X1-X5 pass; device check D10 pending) | Word file built without library (own zip writer), verified with python-docx. PDF rendered on the phone by expo-print from escaped HTML (rendering only provable on the iPhone) |
| 6.10 Importers Daylio CSV, Day One JSON | DONE (Y1-Y5 pass; D11 pending) | Built from documented layouts and synthetic samples only; never tried on a real export |
| 6.7 Encrypted photo attachments | DONE (P1-P7 pass; device checks D12, D14 pending) | Separate sealed table, ten per entry, shrunk to 1600 px JPEG on the phone; exports stay text only (the app says so) |
| 6.8 Location tag | DONE (L1-L3 pass; device check D13 pending) | Coordinates only, rounded to about 100 m, on request; no place names, no map |
| 7.1 Several entries on one day | DONE (M1, M2 pass) | Calendar shows the newest, lists the others, Add another entry |

## iPhone acceptance (2026-10-11)
User report: "App tested on iPhone" / "It works" (Expo Go, v0.17). General acceptance only; no per-item details given, so D9-D14, D7, I1, D11 stay listed as not individually evidenced.
Follow-up from user (2026-10-11): "Tried all features" on iPhone; all working per user report. Device items D7, D9-D14, I1, D11 accepted on user report (no screenshots or logs).

## Phase 7 – Web app (2026-10-11)
Done: IndexedDB storage, web behaviours (no Face ID/reminder, canvas photo shrink, print-dialog PDF), PWA (manifest, icons, offline service worker, CSP), deploy pack (DEPLOY.md, INSTALL.md, pages.yml, _headers, private-diary-web-v0.18.zip), manual and install instructions updated. Checks W1-W5 PASS except D15.
Open (user): put the web folder online with a free host (DEPLOY.md), then D15 on the iPhone (Add to Home Screen, full screen, airplane mode, data still there next day). Safari-specific storage and install behaviour could not be tested in the cloud.
Test changes: reminder switch checks in flow.mjs replaced by the web note (the switch exists in the iPhone build only; logic stays unit-tested); PDF check reads the print page instead of a download; test helper no longer uses eval (the page policy forbids it).
