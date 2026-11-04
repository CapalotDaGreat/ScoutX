# Owner decision pack (fill — do not invent)

Copy rows into `docs/release/owner-acceptance.md` with **name + date**. Leaving `_pending_` keeps the release gate NOT VALIDATED.

## Scoped release assumptions (this candidate)

- Continuous CV worker **off** (`APPROVED_CV_WORKER=null`).
- AI footage processing **off** until separate provider approval.
- Candidate **D not promoted** (appearance-only LIKELY still possible) → choose REL-D-OFF **or** wait for independent `answers.csv`.
- Candidate **C** and **E** ON; **A/B** off.
- Public share/CV exports respect Passport privacy; downloaded copies cannot be recalled.

## SEC rows (Accept / Mitigate / Block)

| ID | Suggested decision wording (edit freely) |
|---|---|
| SEC-10 | Accept guest deletion without re-auth for launch **or** Mitigate: require recent login |
| SEC-11 | Accept 24h deletion resume with older session **or** Mitigate: shorten window |
| SEC-12 | Accept self-declared age band with youth gates **or** Block until stronger age proof |
| SEC-13 | Accept no malware scan on uploads with quarantine lifecycle **or** Mitigate: add scanning |
| SEC-14 | Accept Expo-breaking dependency advisories tracked separately **or** Block |
| SEC-17 | Accept guardian email as controller of consent link **or** Mitigate |
| SEC-18 | Accept first under-13 band without re-auth **or** Mitigate |

## Release scope

| ID | Decision |
|---|---|
| REL-D-OFF | Accept shipping with D off (appearance-LIKELY residual) **OR** wait for independent D review |
| REL-CPU | Accept no-CV-worker / defer CUDA gap vs `51d41c9…` |

## Counsel

Material local change since prior packet: public export field selection + privacy filter. Send `counsel-packet-2026-11-04.md` + note `filterPortfolioForPublicExport` / share-card omit controls. Clear `LEGAL_REVIEW_REQUIRED` only after named counsel/owner reply.
