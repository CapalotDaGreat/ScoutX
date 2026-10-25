# App Review notes (paste into App Store Connect → App Review Information → Notes)

Fill in every `<…>` before pasting. Keep the credentials current for every submission.

Before submitting: these notes describe uploading a video and AI analysis. That only works once
`AI_FOOTAGE_PROCESSING_APPROVED=true` is set after the AI provider privacy review. If it is not set,
remove the upload / AI analysis sentences below (and from the screen recording), or the reviewer will
see "Video analysis isn't available yet" for a feature the notes promise.

---

**1. Screen recording**
Attached: recording on a physical iPhone running the latest iOS. It starts at app launch and shows
registration, login, the main player flow, uploading a video, reporting and blocking, the
subscription paywall, and account deletion.

**2. Purpose and audience**
PitchProof is a football (soccer) development app for players,
their guardians, coaches and scouts. Players build a "Football Passport" from their own match logs,
highlight videos, movement sessions (distance and pitch heatmap measured on the phone; no location is
stored or uploaded), development goals and coach endorsements. Every item shows its source, so
scouts see evidence instead of claims. The app does not guarantee trials, contracts or selection.
Players aged 13–17 need a guardian's approval before youth features are active. Under-13 accounts
use private mode and require parental consent through a signed form followed by confirmation email.
They cannot publish profiles or media, appear in discovery, receive scout contact or trials, or
share a public Passport. A parent may separately approve AI analysis; it stays unavailable without
both consent and the production provider approval. This app is not submitted to the Kids Category.

**3. How to access the features**
- Player (18+, full access, includes sample content): `<email>` / `<password>`
- Player 13–17 (guardian already approved): `<email>` / `<password>`
- Scout: `<email>` / `<password>`
- Coach: `<email>` / `<password>`

Player tabs: Home (today's plan and Football Passport progress), Performance (match logs and
statistics), Media (videos, upload and AI analysis), Discover. Typical flow: Performance → log a
match; Home → Public Football Passport → Preview passport (adult or permitted teen accounts only).
Settings → Privacy Center shows all policies and privacy controls.
Subscriptions: Settings → Plan & usage → See plans (Restore purchases and Manage subscription are on
the same screen). Account deletion: Settings → Delete account.
Reporting: the Report action on any profile, video or request; Block is on the profile.
When footage processing is approved and enabled: Media → analyze match video. Video analysis
currently reviews sampled still frames; continuous player tracking and automatic match-event
detection are unavailable without a separately evaluated and approved computer-vision worker.
Only upload footage for which the reviewer has recording and processing permission.

**4. External services**
- Firebase (Google): Authentication (email/password, Sign in with Apple), Cloud Firestore, Cloud
  Storage, Cloud Functions, Cloud Tasks, Hosting, App Check.
- OpenRouter: server-side text and sampled-frame analysis, requiring providers that support our
  zero-data-retention settings. Footage processing stays disabled until the provider privacy review
  and production configuration are complete.
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
