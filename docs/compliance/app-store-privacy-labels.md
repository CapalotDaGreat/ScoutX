# App Store Privacy Label Matrix

Source for the "App Privacy" answers in App Store Connect. They must match the privacy manifest in
`app.json` (`ios.privacyManifests`) and `legal/documents/privacy-policy.md`. Apple counts data as
"collected" when it leaves the device. LEGAL REVIEW REQUIRED before submission.

**Tracking: No.** No data is used to track users across apps or websites; no ATT prompt is needed.

| App Store category | Data type | Collected | Linked to user | Purpose | Source in app | Manifest key |
| --- | --- | --- | --- | --- | --- | --- |
| Contact Info | Name | Yes | Yes | App Functionality | Profile display name | `NSPrivacyCollectedDataTypeName` |
| Contact Info | Email Address | Yes | Yes | App Functionality | Account; guardian email for 13–17 | `NSPrivacyCollectedDataTypeEmailAddress` |
| Identifiers | User ID | Yes | Yes | App Functionality | Firebase uid (also RevenueCat app user id) | `NSPrivacyCollectedDataTypeUserID` |
| User Content | Photos or Videos | Yes | Yes | App Functionality | Media library, match footage | `NSPrivacyCollectedDataTypePhotosorVideos` |
| User Content | Other User Content | Yes | Yes | App Functionality | Match logs, biography, reports, scouting notes | `NSPrivacyCollectedDataTypeOtherUserContent` |
| Health & Fitness | Fitness | Yes | Yes | App Functionality | Movement sessions: distance, speed, pitch-relative heatmap | `NSPrivacyCollectedDataTypeFitness` |
| Purchases | Purchase History | Yes | Yes | App Functionality | RevenueCat entitlement events | `NSPrivacyCollectedDataTypePurchaseHistory` |
| Other Data | Other Data Types | Yes | Yes | App Functionality | Age band (no date of birth), guardian consent decisions | `NSPrivacyCollectedDataTypeOtherDataTypes` |
| Diagnostics | Crash Data | Yes | No | App Functionality | Sentry, production builds, no user id attached | `NSPrivacyCollectedDataTypeCrashData` |
| Diagnostics | Performance Data | Yes | No | App Functionality | Sentry traces at 20% sample rate | `NSPrivacyCollectedDataTypePerformanceData` |
| Location | Precise / Coarse Location | **No** | — | — | GPS fixes are converted on device to pitch-relative metres and never leave the device | not declared |
| Contacts, Browsing History, Search History, Sensitive Info, Financial Info, Health, Audio (separate), Advertising Data, Product Interaction | — | No | — | — | Not collected | not declared |

## Decisions to confirm

- **Device ID**: the Expo push token is sent to the server to deliver notifications. It is not
  declared as a Device ID here; LEGAL REVIEW REQUIRED to confirm that reading of Apple's definitions.
- **Third-party SDK manifests**: Sentry, RevenueCat and Firebase ship their own privacy manifests,
  which Xcode merges. Re-check the generated privacy report (Xcode → Archive → Generate Privacy
  Report) after the first EAS build. NOT VALIDATED.
- **Age rating**: 4+, with user-generated content. Under-13 accounts run in private mode with parental consent, so Parental Controls and Age Assurance are answered Yes. The app is not in the Kids Category. See `store/listing.json`.

## Permission strings (`app.json`)

| Key | Purpose |
| --- | --- |
| `NSPhotoLibraryUsageDescription` | Pick videos and photos to upload |
| `NSPhotoLibraryAddUsageDescription` | Save processed media |
| Location "When In Use" (expo-location plugin) | Distance and pitch heatmap during an active recording; background location disabled |
