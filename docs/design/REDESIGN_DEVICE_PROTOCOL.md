# Redesign device protocol (addendum to `docs/release/real-device-protocol-5-3.md`)

Nothing in this file has been executed. It lists what only a simulator, a phone or a person can check,
with the pass condition for each row. Web captures in `docs/design/redesign-2026-11/` are **not** evidence for any row.

Record for every run: commit SHA, build ID, device, OS version, text-size setting, light/dark, tester, date.

## 0. What is needed to run it

| Need | Why | Who |
|---|---|---|
| An iOS simulator or internal build of the integration candidate | No native binary of the redesign exists. The newest EAS build is production build 4 from 2026-10-22 at commit `6679226`, before the redesign | Owner approval: builds are billed |
| A cloud simulator session, or a Mac with Xcode, or an iPhone | This workspace is Linux without KVM, Xcode, `adb` or an emulator | Owner |
| Android build and device or emulator | The last Android production build (2026-10-07) failed in prebuild; Android has never been validated for this design | Owner |
| The emulator or a sandbox Firebase project reachable from the device | Test accounts and fixtures; never production users | Owner |

Profiles (rechecked 2026-11-12 evening):

| Artifact | Profile and command (not run) | Runs on | App Check | Signing | Covers | Cannot cover |
|---|---|---|---|---|---|---|
| BLD-1 simulator build | `eas build --platform ios --profile simulator --non-interactive` | iOS Simulator only (`.tar.gz` with `PitchProof.app`) | debug provider, simulator only (`cef23db`); the token it prints must be registered (action APC-3) before protected requests succeed | none | L1-L13, A4, A6-A8, E1-E2 generation, S1, S7, S10, S11, and with C3 also onboarding, Discover, Plan, deletion (S6) | App Attest / DeviceCheck, VoiceOver in a cloud session, QR scanning, purchases (StoreKit sandbox needs a device or local StoreKit config), physical performance |
| BLD-2 physical-device build | `eas device:create` (register the tester's iPhone UDID), then `eas build --platform ios --profile preview --non-interactive` | registered iPhones only (Ad Hoc) | App Attest, DeviceCheck fallback; needs action C1 | Apple Distribution certificate and Ad Hoc provisioning profile, managed by EAS (Apple account sign-in by the owner) | S9, A1-A3 VoiceOver, A5 n/a (iOS), E1-E2 on device incl. QR and AirDrop, S2-S6, S8 sandbox purchases | anything about the simulator; not a TestFlight or store build |

Both builds use the production Firebase project (no staging project exists) and need throwaway test accounts there;
B-19 (Authentication not configured) blocks every signed-in row on both until action AUTH-1 is done.

### Which artifact covers which row

| Rows | Simulator build (`simulator`) | Physical iPhone (Ad Hoc `preview` or TestFlight) |
|---|---|---|
| L1-L13 layout, A4 large text, A6 reduce motion, A7 colour, A8 targets | yes | yes |
| A1-A3 VoiceOver | only with a person at a Mac running the simulator; a cloud session cannot drive VoiceOver | yes |
| Screens behind enforced callables (role selection, age gate, consent, Discover, Plan and usage, upload, deletion) | **no**: a simulator can never attest, so these fail if the live functions enforce App Check (see `docs/release/app-check-behaviour-2026-11-12.md`) | yes, after App Attest is registered |
| E1, E2 share card and CV | generation and the share sheet yes; QR scanning and AirDrop no | yes |
| S9-S11 App Check | S10 only | yes |

Simulator results are recorded as **simulator** and never count for a physical-device row.

## 1. Layout (iPhone SE 3rd gen, iPhone 15/16, iPad 10.9", light and dark)

| # | Screen | Pass when |
|---|---|---|
| L1 | Welcome (first launch, signed out) | Pitch panel, three trust lines, four actions visible without clipping; guest action reachable by scrolling on SE |
| L2 | Role selection, register, login, forgot password | Keyboard never covers the focused field or the submit button |
| L3 | Player Home: Today and Passport | Segment control, identity strip, next-step card; name does not clip; safe area respected under the notch |
| L4 | Tab bars (player 5, scout 4) | Labels not truncated in German; centre action does not overlap the home indicator |
| L5 | Discover, scout player detail | Card indicators aligned; pitch header not clipped; Back, Compare and Save reachable |
| L6 | Pipeline: empty, one player, many | Stage headers readable; move sheet opens and closes by swipe and by button |
| L7 | Match review with owner confirmation | "Is this you?" choices fully visible; nothing attributed before confirmation |
| L8 | Settings, Plan and usage, Privacy Center | Reachable from Settings and by link; Back returns |
| L9 | Sheets and dialogs (share, log match, save filters, request endorsement, delete account) | 20 pt side padding; dismiss by swipe, backdrop and button; no double dismissal |
| L10 | iPad | Content column no wider than 760 pt on Screen-based pages and on the Discover list (1180 pt with two columns) |
| L11 | Text fields (login, register, log match, notes) | A tap anywhere inside the field box focuses the field, including near its top and bottom edge (fixed on web in `f150d49`; the native TextInput must be checked) |
| L12 | Sort control on Discover | One VoiceOver stop announced as a button with its value; no separate text field inside it |
| L13 | Cold link then immediate Back (B-20): open `pitchproof://` links to Settings, Requests and Trials from a killed app (signed in), tap Back as soon as it appears | The loading screen covers everything until the app is ready; the first visible Back works on the first tap and leads to Home; no flash of the screen before the loading screen; repeat 5 times per link. Also: sign out, open a private link, sign in, Back after the restored screen |

## 2. Accessibility

| # | Check | Pass when |
|---|---|---|
| A1 | VoiceOver: Home, Discover card, player detail, match review | Reading order follows the visual order; every control has a name and role; stat values are read with their label ("Matches, 1"; "Average rating, not recorded") |
| A2 | VoiceOver: segmented controls and tabs | Selected state announced |
| A3 | VoiceOver: sheets | Focus moves into the sheet, is trapped there, returns to the opener on close |
| A4 | Dynamic Type at the largest standard size and at AX3 | No clipped names, buttons or stat labels; cards grow instead of truncating. Share card image intentionally ignores text size |
| A5 | TalkBack (Android) | Same as A1 to A3 |
| A6 | Reduce Motion | No sliding or scaling beyond system defaults |
| A7 | Colour independence | Win/loss, evidence level and stage are readable in greyscale (text or icon present) |
| A8 | Touch targets | Card actions, chips and header icons at least 44 pt |

## 3. Native exports and privacy

| # | Check | Pass when |
|---|---|---|
| E1 | Share card via the native share sheet | Image is 1080 px wide or more, name not clipped, portrait cropped correctly or initials shown; hidden fields absent |
| E2 | Football CV PDF generated on the phone | Fonts, wrapping and page breaks match the intent; link is tappable; hidden sections say "private" and show nothing else. The Chromium render is not evidence for WebKit |
| E3 | Long and non-Latin names (for example 40 characters, Cyrillic, Arabic) | Wrap, no tofu boxes |
| E4 | Temporary files | Cancelling the share sheet leaves no growing pile in the app cache (inspect container on simulator) |
| E5 | Second account | A scout account cannot export or see fields the player has hidden; a private Passport cannot be exported at all |
| E6 | QR code | Scans to the public Passport address of the test account |

## 4. States on device

| # | State | Pass when |
|---|---|---|
| S1 | Airplane mode on Home, Discover and during match logging | Loaded content stays; half-written input is kept; banner shown |
| S2 | Photo permission denied at upload | Message explains how to allow access; nothing crashes |
| S3 | Upload interrupted (background the app, switch off network) | Upload resumes or fails with a clear retry; no duplicate match |
| S4 | Plan limit reached (test account with exhausted quota on a sandbox project) | Limit card names the feature and what stays free; nothing is charged |
| S5 | Expired session (revoke the test account's refresh token) | Returned to sign-in; no private data left on screen |
| S6 | **Settings → Delete account** | The native confirmation appears (it uses a system alert, which has no web equivalent and was never exercised on web); after confirming, the account and its data are removed and the app returns to the signed-out start. Use a throwaway test account only |
| S7 | Broken portrait (test account whose photo file was deleted) | Initials shown in the identity strip, cards and share card; no empty frame |
| S8 | Purchases and restore (StoreKit sandbox tester) | Purchase sheet, restore and the "confirming" state behave as in 5.3; never with a real payment method |
| S9 | App Check success (physical iPhone, after App Attest registration) | Role selection, age gate and consent complete; Discover lists players; App Check console metrics show verified Cloud Functions requests |
| S10 | App Check failure (simulator build, or device before registration) | Where a callable is rejected, the message reads "PitchProof couldn't verify this copy of the app…", never "Your session expired"; the app does not sign the user out or loop |
| S11 | No debug provider in release | Release build log contains no App Check debug-token line; behaviour matches S9 or S10, never a silent success on a simulator |

## 5. Installing and running (for the tester)

**Simulator build on a Mac (Xcode 16 or later):**
1. Download the build artefact from the EAS build page (the link is given in the approval follow-up), unpack it: `tar -xzf build.tar.gz`.
2. `xcrun simctl boot "iPhone SE (3rd generation)"` (repeat later with "iPhone 16" and "iPad (10th generation)"); `open -a Simulator`.
3. `xcrun simctl install booted PitchProof.app`, then `xcrun simctl launch booted com.scoutx.app`.
4. Logs: `xcrun simctl spawn booted log stream --level debug --predicate 'process == "PitchProof"' > pitchproof-sim.log`
   (stop with Ctrl-C after each row; logs contain no passwords, but check before sharing).
5. Large text: Settings app in the simulator → Accessibility → Display & Text Size → Larger Text. Dark mode: Settings → Developer → Dark Appearance.
6. VoiceOver in the simulator: Xcode → Open Developer Tool → Accessibility Inspector (Inspection and Audit); full VoiceOver needs a device.

**Physical iPhone (Ad Hoc or TestFlight):** install from the EAS install link or TestFlight; logs via Mac Console.app with
the phone connected (filter `PitchProof`), or Settings → Privacy & Security → Analytics & Improvements → Analytics Data for crashes.

Use only the test accounts named in the approval follow-up. Never use a real player's profile or delete a real account.

## 6. Answer template (one block per row)

```
Row:            (for example L11)
Commit / build: 459defc… / EAS build id … / 1.0.0 (n)
Device:         simulator | physical — model, iOS version
Settings:       light|dark, text size, VoiceOver on|off
Steps:          what you did
Expected:       copy the "Pass when" text
Actual:         what happened
Result:         PASS | FAIL | NOT EXECUTED (reason)
Evidence:       screenshot / screen recording / log file names
```
