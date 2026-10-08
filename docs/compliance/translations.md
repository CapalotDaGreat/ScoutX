# UI Translation vs Legal Translation

PitchProof ships seven UI languages: English, German, French, Spanish, Italian, Portuguese and Dutch
(`src/i18n/locales/<locale>/`). Parity of keys across all seven is checked on every change.

## Two different things

| | UI translation | Legal translation |
| --- | --- | --- |
| What | Buttons, messages, errors, onboarding, store-facing UI text | The 14 documents in `legal/documents/` (privacy policy, terms, subscription terms, youth safety, guardian notice, ...) |
| Source of truth | English UI strings, translated in-repo | English documents only (canonical) |
| Who may change it | Developers | Counsel / the owner |
| State | Translated for all 7 locales; native-speaker review NOT VALIDATED | **English only. Translations LEGAL REVIEW REQUIRED** |

## How the app handles it

- Legal documents are always shown in English, the binding version.
- In other UI languages the app shows a notice (`LEGAL_TRANSLATION_REVIEW_REQUIRED` keys in
  `legal.json`) explaining that the English text is binding and that a reviewed translation is not
  yet available.
- Short legal summaries inside the UI (consent screens, guardian page, deletion texts) are UI
  strings and describe behaviour only; they do not replace the documents.

## Before translating legal documents

1. Counsel approves the English text (LEGAL REVIEW REQUIRED).
2. A qualified legal translator produces each language; machine translation is not acceptable.
3. Counsel decides which language version is binding per market.
4. Translations are added under `legal/documents/<locale>/` and the build (`npm run legal:check`)
   is extended to keep versions in sync.

No legal translation has been commissioned. The decision to offer them is the owner's.
