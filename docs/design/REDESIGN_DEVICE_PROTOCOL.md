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

Build command for a simulator binary (not run): `eas build --platform ios --profile preview` after confirming the
profile in `eas.json` produces a simulator or internal build. Do not use `production` for this.

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
| L10 | iPad | Content column no wider than 760 pt on Screen-based pages; Discover list acceptable |

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

Airplane mode on Home, Discover and during match logging (input preserved); denied photo permission; interrupted upload;
plan limit reached in Plan and usage; expired session; deleted account link.
