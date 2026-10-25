---
id: security-disclosure-policy
title: Security and Responsible Disclosure Policy
version: 1.1.0
effectiveDate: LEGAL_REVIEW_REQUIRED
status: draft
canonicalLanguage: en
requiresAcceptance: false
summary:
- Access to every database collection and storage path is restricted by server-side rules.
- Privileged server actions and AI credentials stay on our backend; Apple handles App Store payments, with RevenueCat used for subscription access.
- If you find a vulnerability, tell us privately. We will not take legal action against good-faith research.
---

## How we protect PitchProof

- Database and storage access rules deny by default and allow each user only their own data, plus what others have explicitly shared.
- Roles (player, scout, coach, staff) are set on our servers, not by the app.
- AI provider keys, signing secrets and payment webhooks exist only on our servers.
- Uploaded files are validated on our servers before processing.
- Staff actions on user content are logged in an audit log that users cannot change.
- Data is encrypted in transit and at rest by our cloud provider.

These controls reduce risk; they are not a guarantee that every account, upload or report is free from vulnerabilities or incidental personal data. App attestation and media format checks are not identity verification or malware scanning.

## Reporting a vulnerability

Send details to {{securityEmail}}. Please include steps to reproduce and the impact you observed.

## Rules for researchers

- Only test against your own accounts.
- Do not access, change or delete other people's data.
- Do not run denial-of-service tests, spam or social engineering.
- Give us reasonable time to fix the issue before disclosing it.

If you follow these rules, we will not pursue legal action against you for your research. We do not currently run a paid bug bounty programme.

## Incidents

If a security incident affects your personal data, we will inform you and the {{supervisoryAuthority}} as required by law.
