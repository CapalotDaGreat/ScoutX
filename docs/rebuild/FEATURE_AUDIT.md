# Feature Audit — PitchProof 2.0 Phase 0

Classification key:

| Code | Meaning |
|------|---------|
| **K** | Keep unchanged internally |
| **R** | Keep but **redesign** UX |
| **F** | Keep but **refactor** internals |
| **M** | **Merge** with another feature |
| **X** | **Replace** with better implementation |
| **D** | **Remove** only if obsolete (document why) |

Every existing product capability must survive unless marked **D** with justification.

---

## 1. Platform & foundation

| Feature | Classification | Notes |
|---------|----------------|-------|
| Auth (email/password) | R + F | Redesign screens; keep Firebase Auth flows |
| Apple Sign-In | F | Keep; verify SDK 57 + plugin |
| Google Sign-In | F | Keep; Expo Go stubs → must use dev client |
| Anonymous / guest | R + F | Keep browse + upgrade prompts; clarify guest limits |
| Role selection (player/scout/coach) | R | Coach still maps to Scout shell — document |
| Account delete | K / F | Wired to CF; keep |
| Settings (theme, language, password, link accounts) | R | Privacy center 2.0 absorbs portfolio toggles |
| i18n (7 locales) | F | Expand coverage; ban new hardcoded strings |
| Deep linking (passport, auth actions) | F | Extend for trials/matches/highlights |
| Sentry | F | Keep; un-stub in production builds |
| App Check | F | Dual RNFirebase path — audit post-SDK57 |
| EAS profiles (dev/preview/prod) | F | Fill Apple team placeholders; verify env |

---

## 2. Player identity & passport

| Feature | Classification | Notes |
|---------|----------------|-------|
| Player profile / Home hub | **X → Today + Passport** | Split: Home becomes **Today**; rich CV becomes **Passport** |
| Edit profile modal | R + F | Faster editing; RHF/Zod |
| Username slugs | K / F | Keep `portfolioSlugs` |
| Public Football Passport | **R** | Passport 2.0 premium CV layout |
| Passport score / readiness | **R / X** | Become smart completion engine with prioritized actions |
| Share portfolio / QR | R | Fold into **Share Kit** |
| Football CV PDF export | K / R | Keep; polish share packaging |
| Portfolio analytics | R | Expand aggregated scout insights (no private IDs) |
| Privacy toggles | **R** | Privacy Center 2.0 + “View as scout” |
| Discoverable sync → `discoverablePlayers` | K / F | Critical; keep sync service |

---

## 3. Growth, stats, matches

| Feature | Classification | Notes |
|---------|----------------|-------|
| Match logging modal | **R / X** | Match Logging 2.0 — Quick vs Detailed; ~30–60s |
| Statistics screens / calculator | R + F | Trends + insights layer |
| Custom SVG charts (radar, progress) | K / F | Keep until chart-lib decision |
| AI insights panel | **R** | AI Coach 2.0 structured sections |
| Weekly report | R | Visual shareable weekly summary |
| Performance insights card | **M** | Merge into Growth / AI Coach |
| Player growth metrics service | **M** | Merge into Growth Center |
| Development goals | **Add** (new) | Spec §36 |
| Training log | **Add** (new) | Spec §37 — lightweight |

---

## 4. Media & GPS

| Feature | Classification | Notes |
|---------|----------------|-------|
| Highlight video library | **R** | Categories, metadata, featured, Scout Reel |
| Video picker / iCloud materialize | K / F | Preserve hard-won iOS export fixes |
| Compression / Storage upload | K / F | |
| Match analysis (Veo film) | R + F | Keep CF pipeline; clearer UX |
| GPS tracking + heatmap | **R** | GPS 2.0 quality score + honest accuracy copy |

---

## 5. Career story

| Feature | Classification | Notes |
|---------|----------------|-------|
| Football journey editor | R | |
| Career timeline screen | **R** | Career Timeline 2.0 event taxonomy |
| Career milestones | **R / M** | Feed Achievements 2.0 |
| Career replay | **R** | Interactive year story |
| Achievements | **R / Expand** | Categories + unlock UX |

---

## 6. Onboarding

| Feature | Classification | Notes |
|---------|----------------|-------|
| Player onboarding checklist on Home | **X** | Replace with Onboarding 2.0 progressive flow |
| Account upgrade prompt (guest) | R | Keep concept |

---

## 7. Scout discovery & evaluation

| Feature | Classification | Notes |
|---------|----------------|-------|
| Scout dashboard | **R / X** | “Who should I look at today?” |
| Discovery search + scope dropdown | R + F | Keep scopes/recent/saved; add alerts later |
| Advanced filters / sort / chips | R | Add form, GPS, endorsements filters carefully |
| Saved filter presets | K / R | Extend → saved searches + notify |
| Discovery cards | **R** | Scout Player Cards 2.0 |
| Player detail (scout) | **R** | 30-second understandability |
| Player comparison (2–4) | **R** | No “winner”; richer dimensions |
| Scout workspace (recent, compare queue) | K / F | Persist; add notes store |
| Scout private notes | **Add** | Spec §27 — never visible to players |
| Scout search alerts | **Add** | Spec §40 — server-side |

---

## 8. Recruitment, trials, reports

| Feature | Classification | Notes |
|---------|----------------|-------|
| Recruitment pipeline | **R** | CRM stages (Discovered→Archived) |
| Folders / shortlists | K / R | Keep; clarify vs stages |
| Trial invitations | **R** | Trials 2.0 player+scout views |
| Scouting reports | **R** | Post-trial structured report |
| Smart follow-up reminders | **Add** | Spec §29 — optional |

---

## 9. Trust, safety, verification

| Feature | Classification | Notes |
|---------|----------------|-------|
| Trust recommendations / endorsements | R | Clear “opinion vs verified” labeling |
| Request coach endorsement | K / R | |
| Verification requests/states | R | Trust & Verification 2.0 taxonomy |
| Block / report | K / F | |
| Admin review card + CF | K / F | Keep gated |

---

## 10. Activity & notifications

| Feature | Classification | Notes |
|---------|----------------|-------|
| Activity feed / inbox | **R** | Activity Center 2.0 categories |
| Push tokens + Expo push on activity | F | Preference intelligence |
| Notification preferences | **R** | Immediate / daily / off per category |

---

## 11. Thin / incomplete modules

| Module | Files | Classification |
|--------|-------|----------------|
| `player-growth` | 1 service | **M** into Growth Center |
| `performance-insights` | 2 files | **M** into Growth / AI |
| `admin-review` | 2 files | **K** |
| `club-profiles` | 4 files | K / F — low priority |
| `share-cards` | 4 files | **M** into Share Kit |
| `weekly-report` | 3 files | R |
| `portfolio-analytics` | 3 files | R |

---

## 12. Explicit removals (candidates only)

Nothing marked **D** yet. Candidates to revisit after SDK + IA:

| Candidate | Why reconsider | Decision gate |
|-----------|----------------|---------------|
| Dead dual favouriteIds (if any remnant) | Historical dual save | Confirm absent in Phase 2 |
| Expo Go–only stub paths as “supported production” | False confidence | Document: prod = dev client / store builds |
| Client OpenRouter path in prod | Already forced off in prod | Remove dead client key plumbing in Phase 2/10 |

**Do not delete** match analysis, GPS, comparison, trials, passport, discovery, or pipeline.

---

## 13. New features (from product spec) — priority

| Priority | Feature | Depends on |
|----------|---------|------------|
| P0 | Today dashboard | Design system, profile data |
| P0 | Onboarding 2.0 | Auth |
| P0 | Passport 2.0 + View as scout | Privacy |
| P0 | Match logging 2.0 | Stats model |
| P1 | Growth Center + goals | Stats |
| P1 | AI Coach 2.0 | CF AI |
| P1 | Scout dashboard + cards | Discovery |
| P1 | Pipeline CRM stages | Recruitment |
| P1 | Trials 2.0 | Existing trials |
| P2 | Training log | Goals |
| P2 | Scout notes | Pipeline |
| P2 | Scout alerts | Backend |
| P2 | Share Kit | Passport |
| P2 | Offline queue | Data layer |
| P3 | Calendar integration | Trials |

---

## 14. Feature ownership map (for rebuild)

| Domain owner folder | Owns |
|---------------------|------|
| `auth` | Identity, roles, upgrade |
| `player-profile` | Profile doc, Today inputs |
| `public-portfolio` | Passport public surface, share, score |
| `player-statistics` | Matches, calc, charts |
| `match-analysis` | Long-form video AI |
| `highlight-videos` | Short clips |
| `gps` | Sessions / heatmap |
| `career-*` + `football-journey` | Story |
| `scout-discovery` | Search, cards, workspace |
| `scout-recruitment` | Pipeline CRM |
| `trial-invitations` | Trials |
| `scouting-reports` | Reports |
| `trust-*` / `verification-*` | Trust |
| `activity-feed` / `notifications` | Activity center |
| `ai-insights` / `weekly-report` | AI Coach |
| `settings` | Privacy center shell |

New folders only when a domain doesn’t fit: e.g. `player-goals`, `training-log`, `scout-notes`, `scout-alerts` — prefer extending existing first.
