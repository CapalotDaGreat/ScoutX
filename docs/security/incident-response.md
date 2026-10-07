# Incident Response Plan

Owner: CML Electronics. Security contact: `LEGAL_CONTACT_REQUIRED` (to be filled in
`src/config/legalConfig.ts`). Incident lead and deputy: not yet named, EXTERNAL CONFIGURATION REQUIRED.

## Severity

| Level | Examples | First response |
| --- | --- | --- |
| SEV1 | Data breach involving minors or media; inappropriate contact with a minor; leaked secret | Immediately, any time |
| SEV2 | Breach of adult personal data; rules misconfiguration exposing data; AI provider retention incident | Same day |
| SEV3 | Single-account compromise; abuse wave; failed scheduled cleanup | Next working day |

## General procedure

1. **Detect**: user report (in-app report, security contact), Sentry alert, Cloud Logging alert, processor notice.
2. **Contain**: revoke the affected access (disable account via moderation action, rotate secret, set
   `ENFORCE_APP_CHECK`, deploy tightened rules). Never loosen rules to restore a feature.
3. **Preserve evidence**: export relevant Cloud Logging entries and `adminAuditLog` entries before they rotate.
4. **Assess**: what data, which users, whether minors are involved, likely consequences.
5. **Notify** (see below).
6. **Recover and learn**: fix, add a regression test, write a post-incident note.

## Inappropriate contact with a minor (SEV1)

1. Restrict the reported account at once (`applyModerationAction` suspend or ban); the action is
   logged in `adminAuditLog`.
2. Hide content involved (moderation hold); do not delete it, because it may be evidence.
3. Inform the minor's guardian through the verified guardian email.
4. Preserve the case (`moderationCases`, related requests and trial invitations); exclude it from
   routine retention cleanup until legal advice says otherwise.
5. Where there is a risk to the child's safety, contact the police (Switzerland: 117) and follow
   counsel's advice on reporting duties. LEGAL REVIEW REQUIRED for exact reporting obligations.
6. Review whether the scout's other contacts with minors need the same steps.

## Personal data breach: notification

- **FDPIC (Switzerland)**: report a breach that is likely to lead to a high risk to the data
  subjects' personality or fundamental rights "as soon as possible" (Art. 24 FADP), through the
  FDPIC's online breach reporting portal.
- **Affected users**: inform them when it is needed for their protection or the FDPIC requests it
  (Art. 24(4) FADP). For minors, inform the guardian as well.
- **EU users**: if GDPR applies, notify the competent supervisory authority within 72 hours
  (Art. 33 GDPR). No EU representative is appointed; LEGAL REVIEW REQUIRED.
- **Processors** must report breaches to CML Electronics without undue delay under their DPAs.
- Keep a breach record (facts, effects, measures) even when no notification is required.

## Secret leak

Rotate in Secret Manager (`firebase functions:secrets:set ...`), redeploy affected functions,
invalidate dependent tokens (a rotated `GUARDIAN_LINK_SECRET` invalidates all open guardian links,
which must be re-sent), review logs for use of the old secret.

## Contacts list

| Role | Contact |
| --- | --- |
| Security / privacy contact | LEGAL_CONTACT_REQUIRED |
| Incident lead | EXTERNAL CONFIGURATION REQUIRED |
| Legal counsel | EXTERNAL CONFIGURATION REQUIRED |
| FDPIC | Breach reporting portal on the FDPIC website |
