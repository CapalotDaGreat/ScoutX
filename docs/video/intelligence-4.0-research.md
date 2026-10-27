# Video Intelligence 4.0 — product research (2026-10-27)

Scope: what the leading football video products do for an individual player, which interaction
patterns are worth learning from, and what PitchProof can do that is distinctive and honest.
This is desk research from public product documentation, not user research and not hands-on
testing of the competitor products. Nothing below copies branding, layouts or assets.

## 1. Sources reviewed

| Product | Source (public) | Notes |
|---|---|---|
| Veo Player Moments | support.veo.com article 27698176364817 | jersey-number AI + rules |
| Veo Analytics 2 | support.veo.com article 11873714080657 | physical + event metrics, correction |
| Veo Coach Assist | support.veo.com article 44191212222097 | chat over text match data |
| Trace PlayerFocus | businesswire.com release (May 2023) | per-player playlists |
| Hudl (soccer) | hudl.com/blog/whats-new-soccer | Assist+, athlete playlists, AI Insights beta |
| Wyscout | hudl.com/products/wyscout/faq | pro event data + video, scouting |
| Gemini video | ai.google.dev gemini-api video-understanding (mirror) | 1 fps sampling, timestamps |
| TwelveLabs | docs.twelvelabs.io quickstart / search | indexed semantic clip search |

The traceup.com product page could not be fetched; Trace findings come from the press release only.

## 2. Comparison (as documented by each vendor)

| Dimension | Veo | Trace | Hudl | Wyscout | PitchProof 3.2 (measured) |
|---|---|---|---|---|---|
| Onboarding | Own camera; analytics need recordings made after a cutoff date and an add-on | Own camera service | Focus cameras or upload; schedule-based recording | Licensed competition feeds; Tag-on-Demand for own footage | Phone/any upload or direct-media link |
| Time to first result | Not stated | "After the game", no figure | "Right away" for athlete playlists | Tag-on-Demand ≤ 48 h | ≈80 min CPU for 34 min; no early result |
| Player identification | Jersey numbers 1–25, bold contrasting fonts; accuracy depends on setup | AI spotlights each player | Assist+ (analyst-assisted) | Human tagging (~2,500 points/match) | Number OCR + kit colour + tracklets, explicit identity states, user review |
| Automatic highlights | Player Moments playlist; adjustable ball distance, time on ball, seconds before/after | Personal playlist per player | Automatic athlete playlists | Clips per event | Not yet (4.0 adds) |
| Coaching | Coach Assist chat (beta, desktop/tablet), "verify against footage" disclaimer | Coach searches playlists | AI Insights summaries with video links (beta) | Analyst reports | Deterministic Ask-this-match only |
| Interactive video | Follow-circle on the player, playlists | Zoomed follow | Filter clips by field location and event | Event-linked video | Thumbnails in review only |
| Statistics | Distance, speed, sprints, goals, shots, passes, heat/shot maps; AI events correctable | Not emphasised | Detailed (mainly coach-facing) | Very deep pro event data | Presence/coverage only; physical metrics uncalibrated |
| Personalisation | Coach tone/level settings | Parent subscription per child | Recruiting profile | Custom report templates | Position in setup |
| Sharing | Manual clip creation, no bulk download | Share with family/recruiters | Playlists to recruiting profile | Send clips to Hudl | Existing reel studio |
| Mobile | Coach Assist PC/tablet only | App | App with filters | Desktop-first | Mobile-first app |
| Price / compute | Add-on subscription | $15/month per player (2023) | Team subscriptions | Pro licences | Own worker; GPU not yet measured |
| Accuracy disclosure | Explicit dependency on setup and number style; manual correction | Not found | Not found | Human-tagged | Identity states, coverage, claim audit |

## 3. Interaction patterns worth adopting (in our own form)

1. **A playlist of "your moments" is the core artifact.** Every product that serves players leads
   with a per-player set of clips, not a stats table. Stats are secondary.
2. **Adjustable clip windows.** Veo exposes seconds before/after; we compute context-aware
   windows by default and let the user nudge them.
3. **Correction loops are normal.** Veo lets users correct AI events. Our swipe review
   (Yes / Not me / Not sure / Skip / Undo) is the same principle applied to identity, which is
   the thing that actually fails on amateur footage.
4. **Chat grounded in text data, not raw video.** Veo's coach chat receives match data only and
   tells users to verify against footage. That is the right cost and trust model: we answer from
   the evidence index (moments, identity spans, events) and attach timestamps.
5. **Filter by location/event.** Hudl's filters translate into category chips on My Moments.
6. **Turnaround is the felt quality.** "Right away" playlists (Hudl) vs 48 h (Wyscout TOD):
   showing first moments early matters more than total runtime.

## 4. Where PitchProof can be distinctive

- **Honesty as a feature.** No competitor surfaces per-moment identity evidence. We label every
  moment *Confirmed on video*, *Needs your review* or *Not measurable from this recording* and never
  promote uncertain tracking to a football event.
- **Any camera.** Veo/Trace depend on their own hardware; we accept phone footage and direct links.
- **Five-question review** (did well / improve / where / how / trend) instead of a dashboard.
- **Evidence-gated coach.** Every insight carries what happened, why it matters, what to do
  differently, how to practise and where to see it; with no evidence, it says so.
- **Mobile-first coach and review**, where Veo Coach Assist is desktop/tablet only.

## 5. External AI services (layer B options) — compute implications

- **Gemini**: samples video at 1 fps by default, ≈300 tokens per second of video, timestamps in
  MM:SS, File API for files > 20 MB. A 90-minute match is ≈1.6 M tokens per pass — too costly
  to send per chat message, and 1 fps is too coarse for touches. Suitable only for short,
  user-selected clips, with disclosure and authorisation.
- **TwelveLabs**: asynchronous indexing (Marengo), text query → ranked clips with start/end.
  Useful for semantic search over clips, but it requires uploading the footage to a third party.

Decision for 4.0: no external video model is called by default. The architecture keeps an
optional, disclosed, clip-scoped layer-B hook; private footage is never sent without explicit
authorisation (brief constraint). All numbers come from layer A measurements.
