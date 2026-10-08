# App Review notes (paste into App Store Connect → App Review Information → Notes)

Fill in every `<…>` before pasting. Keep the credentials current for every submission.

---

**1. Screen recording**
Attached: recording on a physical iPhone running the latest iOS. It starts at app launch and shows
registration, login, the main player flow, uploading a video, reporting and blocking, the
subscription paywall, and account deletion.

**2. Purpose and audience**
PitchProof (bundle ScoutX) is a football (soccer) development app for players aged 13 and over,
their guardians, coaches and scouts. Players build a "Football Passport" from their own match logs,
highlight videos, movement sessions (distance and pitch heatmap measured on the phone; no location is
stored or uploaded), development goals and coach endorsements. Every item shows its source, so
scouts see evidence instead of claims. The app does not guarantee trials, contracts or selection.
Players aged 13–17 need a guardian's approval before youth features are active; under-13s cannot
create an account.

**3. How to access the features**
- Player (18+, full access, includes sample content): `<email>` / `<password>`
- Player 13–17 (guardian already approved): `<email>` / `<password>`
- Scout: `<email>` / `<password>`
- Coach: `<email>` / `<password>`

Player tabs: Home (today's plan and Football Passport progress), Performance (match logs and
statistics), Media (videos, upload and AI analysis), Discover. Typical flow: Performance → log a
match; Media → upload a clip → open it → analyze; `<path to the Football Passport preview, confirm on device>`.
Settings → Privacy Center shows all policies and privacy controls.
Subscriptions: Settings → Plan & usage → See plans (Restore purchases and Manage subscription are on
the same screen). Account deletion: Settings → Delete account.
Reporting: the Report action on any profile, video or request; Block is on the profile.
Sample video for upload testing: any short football clip from the Photos library.

**4. External services**
- Firebase (Google): Authentication (email/password, Sign in with Apple), Cloud Firestore, Cloud
  Storage, Cloud Functions, Cloud Tasks, Hosting, App Check.
- OpenRouter: AI video and text analysis, called only from our servers with zero data retention.
- Apple In-App Purchase via RevenueCat: subscriptions and entitlements.
- Expo Push Service (via Apple Push Notification service): notifications.
- Email delivery via the Firebase Trigger Email extension and `<SMTP provider>`: guardian approval emails.
- Sentry: crash reports (no tracking).

**5. Regional differences**
The app works the same in all regions where it is available. Prices are set per storefront by Apple.
The interface is available in English, German, French, Spanish, Italian, Portuguese and Dutch.

**6. Regulated industry / third-party material**
The app does not operate in a regulated industry and does not include licensed third-party content
(no league data, club logos or broadcast footage). All football data and videos are added by users,
who confirm they have the right to upload them. Content can be reported and is moderated.

**Subscriptions**
PitchProven Monthly (`PitchProven_Monthly`) and PitchProven Yearly (`PitchProven_Yearly`) raise
monthly AI analysis limits. Safety tools, privacy controls, reporting, account deletion and match
logging are always free. The paywall is only shown when the user opens it.
