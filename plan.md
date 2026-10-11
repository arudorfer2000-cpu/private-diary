# Private Diary – iPhone App: Plan and Roadmap (v1)

Status: DRAFT, waiting for approval. No code is written until you approve this plan.

## Decisions so far
- Platform: iPhone, built with **Expo / React Native**, developed on your **Windows PC**, tested on your **iPhone**.
- UI: the combined flow (Vault, Calendar, Voice, Review) from the design canvas.
- Spec: the requirements and test specification already written (FR-/NFR-/TC- IDs are used below).

## Proposed scope decisions (please confirm)
1. **Version 1 is local-only.** Entries live encrypted on the phone. No server, no email accounts. This skips FR-1 to FR-3 and cloud backup for now and keeps privacy simple. Cloud sync is a later phase.
2. **Encryption in pure JavaScript** (@noble/ciphers, @noble/hashes: Argon2id key derivation, AES-GCM or XChaCha20-Poly1305), so it also runs in Expo Go. Key stored wrapped; Face ID unlock via the iOS keychain.
3. **Dictation in two steps:** first the free iOS keyboard microphone (works in any text field, nothing to build); then an in-app dictation screen using on-device recognition, which needs a development build (see installing below).
4. **English UI first**, German added after v1. Tell me if you want German first.

## Installing on the iPhone ("Installer")
iPhone has no installer file you can download and run. These are the real routes:

| Route | Cost | How it gets onto your iPhone | Limits |
| --- | --- | --- | --- |
| Expo Go (start here) | Free | Install the Expo Go app, scan the QR code from your PC | No custom native modules, so no in-app on-device dictation |
| Development build (EAS) | Apple Developer Program, about $99/year | Cloud build from Windows, install by link or QR on your registered iPhone | Needs paid account and device registration |
| TestFlight | Same account | Invite link; install through the TestFlight app | Each build expires after 90 days |
| App Store | Same account | Public listing | Review, privacy policy, screenshots required |

Plan: Phases 0 to 2 run in Expo Go for free. Phase 3b onward needs the paid account.

## Roadmap
Each step has one output and one check. A failed check sends only that step back (max 3 attempts).

### Phase 0: Foundations (free)
| # | Step | Output | Check |
| --- | --- | --- | --- |
| 0.1 | Set up the PC: Node.js, Expo, project skeleton in `diary-app/` | Running Expo project | `npx expo start` shows a QR code; the starter screen opens on your iPhone in Expo Go |
| 0.2 | Theme and navigation from the design (dark teal, Sora and Newsreader fonts) | Empty screens: Vault, Calendar, Voice, Review | All four screens reachable on the iPhone and match the canvas |

### Phase 1: Core diary (free, covers must-haves)
| # | Step | Output | Check |
| --- | --- | --- | --- |
| 1.1 | Encryption module and key setup (passcode, wrapped key, recovery key) | `crypto` module with unit tests | Round-trip test passes; wrong passcode fails; saved data contains no readable text (ST-1, ST-2) |
| 1.2 | Vault screen: 6-digit passcode, Face ID, attempt limit, auto-lock | Working unlock | TC-4, TC-7 pass on the iPhone; app locks after idle time |
| 1.3 | Encrypted local storage (SQLite) | Entry store | Entries survive app restart; stored values are ciphertext |
| 1.4 | Entry editor with autosave, mood, title | Review/Write screen | TC-8, TC-9: text is not lost when the app is closed mid-sentence |
| 1.5 | Calendar home with mood colours, streak, day preview | Calendar screen | TC-14: marked days match saved entries |

### Phase 2: Completing the diary (free)
| # | Step | Output | Check |
| --- | --- | --- | --- |
| 2.1 | Tags, past-date entries, edit, trash with 30-day restore | Feature complete editor | TC-10, TC-11 |
| 2.2 | Search on the device, filters, Stream list | Search and list | TC-15: correct results, no network requests |
| 2.3 | Settings: idle-lock time, reminders (neutral wording), theme | Settings screen | TC-13, TC-18 |
| 2.4 | Export (Markdown/JSON) and delete all data | Export and delete | TC-16, TC-17 (local version) |
| 2.5 | Free dictation via the iOS keyboard microphone | Mic hint in editor | Dictating into the editor works on your iPhone |

### Phase 3: In-app dictation (needs Apple Developer account)
| # | Step | Output | Check |
| --- | --- | --- | --- |
| 3.1 | Create the development build with EAS and install it on your iPhone | Installable build | App opens from the install link on your registered iPhone |
| 3.2 | Dictation screen with on-device recognition and the "audio never uploaded" badge | Voice screen live | TC-19 to TC-28; network log shows no audio upload (TC-20) |
| 3.3 | Punctuation commands, language choice, microphone-denied handling | Polished dictation | TC-24, TC-26 |

### Phase 4: Quality and release
| # | Step | Output | Check |
| --- | --- | --- | --- |
| 4.1 | Accessibility pass (VoiceOver, text size, contrast) | Fixes applied | AT-1 passes on the iPhone |
| 4.2 | Security review against section 6.4 of the test spec | Test report | ST-1 to ST-8 all pass or have a logged fix |
| 4.3 | TestFlight beta to your own iPhone | Beta install | Acceptance tests AC-1 to AC-4 pass |
| 4.4 | App Store pack: icon, screenshots, privacy policy | Submission pack | Checklist complete |

### Phase 5 (later): Sync and backup
Optional encrypted cloud backup and multi-device sync. Not in v1.

## Honest limits
- I write the code, but I cannot run an iPhone here. Every "check on the iPhone" needs you to test and report what you see.
- Real dictation accuracy and speed must be measured on your phone (PT-6).
- Apple prices and rules can change; confirm the developer fee on Apple's site before paying.

## Needed from you before step 0.1
1. Approve this plan or tell me what to change.
2. Confirm the four scope decisions above.
3. Confirm Node.js is installed on your PC (I will give you the exact commands either way).


## Changes since approval (2026-10-11)
- Browser test harness added (`npm run build:web`, `npm run e2e`): the real screens run in headless Chromium at iPhone size, because the cloud has no iOS simulator. Stand-ins (`*.web.ts`) are never part of the iPhone build.
- Step 1.6 (new): restore on a new phone using the recovery key and the recovery blob stored in the database. Built and checked.
- Step 2.5 now also removed the prototype dictation screen; the real one arrives in step 3.2.
- Remaining before a store release: Phase 3 (needs Apple Developer account), Phase 4 (accessibility pass, independent security review, TestFlight, App Store pack).

## Phase 6 – Free feature additions (added 2026-10-11 after the requirements review)
Rule from the user: add capability only if it costs no extra money (no paid developer account, no server, no paid service, no network use that breaks "nothing is sent anywhere").
Order: 6.1 On This Day · 6.2 Writing templates · 6.3 Insights (statistics, mood trends) · 6.4 Search date filter · 6.5 Markdown preview · 6.6 Backlinks [[Title]] · 6.7 Photo attachments (encrypted) · 6.8 Location tag (coordinates only) · 6.9 Exports: plain text, DOCX, PDF · 6.10 Importers: Daylio CSV, Day One JSON.
Not added (needs money, a server or a second product): sync, cloud backups, Watch/widgets/Siri, desktop apps, Apple Pencil, weather and link embeds (network), in-app dictation. Screenshot blocking is not possible on iOS; the app-switcher cover stays.

Batch A (2026-10-11, "Proceed"): 6.9 exports and 6.10 importers first (verifiable here), then Batch B: 6.7 photos and 6.8 location (need native pickers; checks written before that work).
Batch B design notes (2026-10-11): photos in separate sealed table with entry_id link; Entry gets optional photos[] (ids) and place {lat, lon}; exports stay text only and the app says so.

## Phase 7 – Web app (installable on the iPhone for free) (2026-10-11)
Why: no paid Apple developer account means no App Store/TestFlight app. A web app added to the iPhone Home Screen (PWA) runs full screen, works offline, has no 7-day expiry and costs nothing. The same build also runs in any desktop browser. Hosting: any free static host (GitHub Pages, Cloudflare Pages, Netlify). No server code, no network use by the app.
Decisions: keep one code base (Expo web export); the `*.web.ts` files become the production web implementation (no longer "harness only"); data stays in the browser on the device (IndexedDB), sealed exactly like on the phone; Face ID and daily reminders are not available on the web and are hidden with a one-line explanation; the web version is told to use a passphrase-or-6-digit passcode exactly as before.
| # | Step | Output | Check |
| --- | --- | --- | --- |
| W1 | IndexedDB storage (database file and key bundle), flushed when the tab hides or the diary locks, persistent-storage request | Storage that survives reload and holds photos beyond the 5 MB localStorage limit | Checks W1.x |
| W2 | Web behaviour: no Face ID/reminder controls, photos shrunk with canvas, PDF via print dialog, lock when the tab is hidden for the idle limit, backup reminder text | Honest, usable web UI | Checks W2.x |
| W3 | PWA: manifest, icons, Apple meta tags, service worker (offline), meta CSP (no network) | Installable offline app | Checks W3.x |
| W4 | Deploy pack: GitHub Pages workflow, `_headers`, DEPLOY.md, ready-to-upload zip; manual and install instructions updated | Deployable and documented | Checks W4.x |
| W5 | Full verification: tests, typecheck, audit, e2e (old + new), iOS bundle free of web code | Release v0.18 | Checks W5.x |
Cannot be tested here: real Safari/iPhone (only Chromium is installed). The Home Screen install, Safari storage behaviour and the share sheet need the user's final pass.
