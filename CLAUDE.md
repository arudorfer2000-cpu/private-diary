# Private Diary (iPhone app)

Read this, plan.md and progress.md first when resuming.

## Project
- Private diary for iPhone. Expo / React Native (SDK 57), TypeScript, developed on Windows, tested on iPhone in Expo Go. UI text in English; German added after v1.
- Version 1 is local-only: encrypted on the device, no server, no accounts.
- Specs: requirements and test specification (FR-/NFR-/TC- ids) live in the Claude Docs document "Online Private Diary – Requirements Specification".
- UI source of truth: Design canvas "Private Diary UI Proposals", flow 7 (Vault, Calendar, Voice, Review).

## Commands (run in `app/`)
- `npm install`, `npx expo start` (or double-click START-DIARY.bat on Windows)
- `npm test` (encryption unit tests), `npm run typecheck`

## Rules
- Harness mode: checks are written before work; step results go into checks.md with real evidence; a failed check sends only that step back (max 3 attempts); never weaken a check.
- Encryption lives only in `src/crypto`. Never store the passcode, data key or recovery key in readable form. Never log decrypted content.
- Install Expo packages with `npm install <pkg>@<version>` using the exact range from `app/node_modules/expo/bundledNativeModules.json` (these match Expo Go). `npx expo install` cannot reach Expo servers from the cloud workspace.
- Test build: auto-lock limit is 1 minute in App.tsx (IDLE_LIMIT_MS); spec default is 5 minutes, set via settings in step 2.3.
- Cloud workspace has no iPhone: device checks must be reported by the user.
- Storage: entries are sealed in SQLite (`src/storage`); only day and timestamps are clear. Database access goes through the `Db` interface so tests use node:sqlite and the phone uses expo-sqlite.
- Editor: all edits go through `EditorSession` (src/editor): autosave 600 ms, serialized saves, flush before lock/background.
- Testing without a Mac: the cloud has no iOS simulator. `npm run build:web` + `npm run e2e` run the real screens in headless Chromium at iPhone size (sql.js and IndexedDB replace SQLite and the keychain via `*.web.ts`; since Phase 7 these are the production web app, not only a harness, and never part of the iOS bundle). Extend `e2e/flow.mjs` for every new screen. User preference (2026-10-11): they want the finished product, not step-by-step device testing; do all testing possible here and ask them only for a final acceptance pass on the iPhone (keychain, Face ID, unlock speed, app switching).
- Trash: emptying an entry or Move to trash is recoverable for 30 days (purged on unlock); only Delete forever and discarding a brand-new entry remove rows for good.
- Theming: never import a fixed colour palette. Screens use `useTheme()` and `makeStyles(colors)`; palettes live in src/palettes.ts. Use aria-selected/aria-checked/aria-disabled instead of accessibilityState (web does not expose the latter). Settings live in the key store (keychain) so they are readable before unlock.
- Dictation: only the iOS keyboard microphone until Phase 3 (in-app recognition needs an Apple Developer account). Never insert made-up text into entries. The palettes keep voice* colours for the Phase 3 dictation screen.
- Restore: the database holds an encrypted recovery blob (saved at every unlock). VaultFlow offers a restore whenever entries exist but the keychain has no bundle. Never remove the blob saving in App.tsx.
- Accessibility: every tappable element is at least 44x44 pt, has a name, and every screen has a heading (accessibilityRole="header"). Messages that appear by themselves go in an accessibilityLiveRegion. Mood is never colour only. The e2e "X1-X3" scan enforces this: extend it for each new screen.
- Security: run `npm run audit` before every release. It enforces: no network, no console, parameterised SQL, crypto imports only in src/crypto, storage writes only in vault modules. Add a planted-violation test in scripts/audit.test.mjs for any new rule. Never describe the app as independently audited (see security-review.md).
- Passcode: 6 digits or a passphrase of 10 to 128 characters (NFKC-normalised in VaultService, never in the UI). The kind ("pin"/"phrase") is stored next to the bundle only to pick the unlock screen. Any new passcode entry screen must support both and pass the accessibility scan.
- Language: every user-visible text goes through `t('English text')` from `useI18n()` (English text is the key; German in src/i18n/de.ts). Variable text uses `{name}` placeholders, never string concatenation of translated pieces. i18n.test.ts and the e2e L5 German walk fail on missing or unused entries and leftover English; add new screens to the L5 walk. Typed confirmation word stays DELETE.
- Import: only this app's JSON export (format 1), parsed by src/import/importer.ts (strict file, forgiving entries), stored through repo.importEntries (all or nothing, never overwrites). Plaintext of a chosen file is dropped on lock. The web stand-in for the file picker is harness only.
- Hooks in App.tsx (useCallback/useEffect/useRef) must stay above the 'if (!fontsLoaded)' early return (React error 310).
- Photos: sealed bytes in the `photos` table (AAD "photo:<id>"), listed by id in the sealed entry, max 10 per entry and 4 MB each. Every code path that removes entries must remove their photos (repo.deletePermanently/emptyTrash/purgeExpired, wipeAll, eraseOldDiary); photos not linked to a saved entry are purged at unlock. Exports are text only and say so.
- Location: coordinates only, rounded to 3 decimals, only when the person taps "Add location". No reverse geocoding or maps (those need a network service).
- Importers: Daylio CSV and Day One JSON (src/import/others.ts) were written from documented layouts and tested only on synthetic samples; never claim they were tested with a real export.
- Word export is built by our own zip writer (src/export/zip.ts); XML namespace names are assembled so the no-network audit rule stays strict. python-docx must open the result (formats.test.ts).
- Editor layout: everything between the title and the mood/Done footer lives in one ScrollView; new editor rows go there, never next to the footer.
- Calendar: a day can hold several entries (groupByDay, newest-updated first = shown and opened by Edit). Review is keyed by entry id so editors of one day never share state.

## Web app (Phase 7)
- The web export is a product: installable PWA (manifest, icons, service worker, offline), data in IndexedDB (src/web/idb.ts, database file and key bundle), nothing in localStorage. Build with `npm run build:web` (adds the PWA files through scripts/pwa.mjs); sub-folder hosting uses `PD_BASE_URL=/name`.
- The web app must never contact another site: meta CSP + `_headers` (connect-src 'self'), service worker only serves its own cache. scripts/pwa.test.mjs and e2e/web.mjs W3.3 enforce this; keep both when changing pwa.mjs.
- A web write is reported done only after IndexedDB confirmed it (expoDb.web.ts). Do not make saves fire-and-forget.
- Web has no Face ID and no reminders (hidden with an explanation); the web version is protected by the passcode only, and Settings says so. Never claim keychain-level protection for the web version.
- `npm run e2e` runs flow.mjs (34 checks) and web.mjs (10 checks). Safari/iPhone behaviour (Add to Home Screen, storage rules, share sheet) cannot be tested in the cloud: only the user can.
- Deploy pack: DEPLOY.md, INSTALL.md, .github/workflows/pages.yml, private-diary-web-v*.zip (root-hosted build). Keep the manual in sync with INSTALL.md.
