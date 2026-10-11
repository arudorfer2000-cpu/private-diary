# Security self-review (v0.11) — NOT independent

Scope: the app source (App.tsx, src/), the dependency list, and what ships in the iOS bundle. Done by the developer (Claude) against a checklist and an automated rule script (`npm run audit`). An independent review (I1) is still open and should happen before a public App Store release.

## What was checked automatically (`npm run audit`, 6 rules, planted-violation tests)
R1 no network APIs or URLs in app code · R2 no console logging · R3 SQL only with `?` parameters · R4 encryption libraries only inside `src/crypto` · R5 storage writes only in the vault modules · R6 no clipboard or share calls outside export.
During this review the audit found one real exception: `biometric.ts` imported a @noble helper directly. Fixed: the helpers are re-exported by `src/crypto`.

## Dependency audit (`npm audit --omit=dev`)
23 findings (15 high, 8 moderate). All are in build and development tooling: expo CLI, metro, node-forge (used by the dev server's code signing), braces/micromatch (file watching), xcode and uuid (config plugins). I checked the iOS bundle's source map: 783 modules from 41 packages, and none of the flagged packages are in it. The fixes npm offers would downgrade Expo to version 44, so they are not applied. Status: accepted, no effect on the shipped app; re-check when Expo SDK is upgraded.

## Findings
| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F1 | Encryption library import outside src/crypto (biometric.ts) | Low | Fixed |
| F2 | Dev-tool dependency advisories (23) | Low for the app | Accepted: not in the shipped bundle |
| F3 | A 6-digit passcode can be guessed offline if someone extracts the keychain data from a phone. Argon2id slows each guess, but only 10^6 combinations exist. | Medium | Mitigated in v0.11: optional passphrase (10+ characters). Digits remain the default, so the risk stays for people who keep 6 digits. The attempt limiter only protects the app, not an extracted copy |
| F4 | Attempt pause relies on the phone clock; changing the clock can shorten a pause | Low | Accepted: the pause protects against casual guessing, not an attacker with the unlocked phone settings |
| F5 | JavaScript cannot reliably erase keys from memory after locking | Low | Accepted: platform limit; keys are dropped on lock, but memory may linger until reused |
| F6 | The iOS keyboard may learn words you type (predictive text/dictionary) | Low | Accepted: iOS behaviour; Settings > General > Keyboard can reset it. Mention in the help text |
| F7 | Exported Markdown/JSON files are NOT encrypted | Medium | Accepted by design: a warning is shown before every export; a future encrypted export is possible |
| F8 | Deleted data may remain in free flash pages of the phone | Low | Mitigated: VACUUM after delete-all; iOS also encrypts storage at rest |
| F9 | The recovery key can unlock everything | Medium | Accepted by design: it is shown once and the user must write it down; the text says to keep it private |
| F10 | Database holds day and timestamps in clear text (everything else is encrypted) | Low | Accepted by design: it makes the calendar fast; reveals only on which days you wrote |
| F11 | Browser harness stand-ins keep keys in localStorage | None for the app | Verified: `*.web.ts` files are not in the iOS bundle (source map check) |
| F12 | Keychain, Face ID, expo-sqlite and backup behaviour on a real iPhone | Unknown | Open: only the final iPhone acceptance can prove them |
| F13 | Apple export-compliance for apps with encryption must be answered before TestFlight/App Store | Process | Open for release (step 4.3) |
| F14 | No independent review done | Process | Open (I1) |

## Result
No high-severity issue found in the app's own code. Two medium points (F3 passcode strength, F7 unencrypted export) are accepted or proposed for v1.1. Do not describe this app as independently audited.
