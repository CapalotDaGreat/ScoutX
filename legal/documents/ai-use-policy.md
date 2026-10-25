---
id: ai-use-policy
title: AI Use Policy
version: 1.3.0
effectiveDate: LEGAL_REVIEW_REQUIRED
status: draft
canonicalLanguage: en
requiresAcceptance: false
summary:
- AI analysis runs only when you ask for it.
- Your data is never used to train AI models by PitchProof; provider requests require no-training and zero-retention routing conditions.
- Footage analysis stays unavailable until the operator approves the provider privacy setup. Routing flags alone do not prove contractual or operational compliance.
- AI output can be wrong. It is guidance, not a rating or a professional assessment.
- Players under 18 can use AI analysis only if their parent or guardian allows it.
---

## What AI does in PitchProof

When you request it, PitchProof uses AI models to describe sampled frames from your footage, summarise your logged data, answer questions about a match and suggest highlight plans. AI runs on our servers. The app never holds AI provider credentials.

## What is sent

Only the data needed for the request: selected frames from your video, and the match details you entered (such as opponent, competition and position), clearly marked as user-provided data. Your email address and account identifiers are not sent.

Frames can still identify people by face, clothing, surroundings or other details, and text you enter can contain personal information. Omitting your account identifier does not make footage anonymous. Only upload and request analysis where you have the required permissions, including for other players and minors shown in the footage.

## No training, no retention

We do not train AI models on your data. We send requests through OpenRouter with data collection denied and zero data retention required, so requests are routed only to providers that commit not to store your data or use it for training.

These are required routing settings, not an independent audit or a guarantee that a processor has no operational metadata. The operator must verify the provider contract, supported endpoint, destination countries and retention terms before enabling footage processing. If no eligible endpoint is available, the request must fail rather than relax those settings. The Privacy Policy describes the current recipients and outstanding transfer confirmations.

## Limits and honesty

- Analysis is based on sampled frames, not on tracking every moment of a match.
- Computer-vision tracking of players, automatic event detection and pitch maps are not available yet and are shown as "Not available yet".
- Actions suggested from still frames are labelled "Needs review" and are never counted as statistics.
- Coaching about you is only shown after you confirm which frames show you. PitchProof does not use facial recognition.
- PitchProof does not give player ratings or predict careers.
- Each result shows what it was based on and how much of the match it covered.
- AI feedback is not medical advice, a professional scouting decision or a promise of development, selection or employment. Do not rely on it alone for decisions affecting a player.

## Safeguards

Results are checked by our servers before they are shown: they must match the expected format, refer only to frames that exist and stay within the video's duration. Text you enter is treated as data, never as instructions to the model.

## Your choices

You can choose not to use AI analysis. All non-AI features keep working. You can delete analysis results at any time.

Optional AI permission can be withdrawn in the Privacy Center; per-video processing can be cancelled through the analysis workflow. Withdrawal does not reverse processing already completed. Deleting an analysis removes the data controlled by PitchProof according to the Data Retention Policy, not records held independently by another user. Tell {{supportEmail}} about incorrect or harmful output so it can be reviewed.
