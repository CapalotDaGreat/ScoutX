# Architecture Audit — PitchProof 2.0 Phase 0

> Generated from the live repository (Expo SDK 54 / RN 0.81).  
> Status: **read-only audit — no application code changed in Phase 0.**

---

## 1. Executive summary

PitchProof is a **feature-first Expo + React Native + Firebase** app with three authenticated shells (Player, Scout/Coach, Guest/Auth). The architecture is **stronger than a typical student portfolio**, with clear domain folders, defensive Firestore parsing, and role-based navigation.

It is **not** yet structured like a commercial V2 product:

| Strength | Weakness |
|----------|----------|
| Feature modules with models/services/repos | No React Query; ad-hoc fetch/subscribe hooks |
| Strict TypeScript + path aliases | Provider nesting is heavy and uneven |
| Role shells + deep linking | IA still “profile hub”, not “Today / Growth / Passport” |
| Cloud Functions for AI/push/analytics | Dual Firebase clients (JS SDK + RNFirebase App Check) |
| Mock data gated from production builds | Discovery is paginate-then-filter client-side |
| Design tokens exist | CSS-var / NativeWind failures forced style workarounds |

**Recommendation:** Keep the feature-first layout. Migrate SDK first (Phase 1). Then introduce a thin data layer (React Query), design system 2.0, and IA redesign — without rewriting every repository.

---

## 2. Repository shape

```
src/
  features/          31 domains (~535 TS/TSX files)
  components/        shared design system
  navigation/        Auth / Player / Scout / Guest
  config/            firebase, ai, appMode, deep links
  theme/             tokens + ThemeProvider
  i18n/              en, de, es, fr, it, nl, pt
  data/              scoped AsyncStorage helpers
  firebase/          pagination helpers
  hooks/, utils/, services/, dev/
functions/           Cloud Functions (Node 20)
docs/                auth/storage notes (+ this rebuild/)
```

**No checked-in `ios/` or `android/`** — Continuous Native Generation / EAS prebuild model. Correct for Expo.

---

## 3. Runtime & entry

| Item | Current |
|------|---------|
| Entry | `index.ts` → classic Expo (not Expo Router) |
| Config | `app.json` + dynamic `app.config.ts` |
| New Arch | `newArchEnabled: true` in `app.json` |
| Expo Go stubs | Metro remaps RNFirebase, Sentry, Google Sign-In when `EXPO_PUBLIC_EXPO_GO=1` |
| Dev client | Preferred for real auth/media/Firebase |

---

## 4. Layering pattern (keep)

Per domain, the intended pattern is:

```
types → models (parse unknown) → services → repositories → hooks/providers → components
```

**Keep this.** It already matches commercial modular monoliths.

**Improve:**

1. Introduce **React Query** for server state (profiles, discovery pages, trials, activity) to replace one-off `useState`+`useEffect` fetch loops.
2. Keep Context for **session-scoped UI state** (auth, scout flow search, recruitment workspace).
3. Add **Zod** (+ React Hook Form later) for form validation; do not replace Firestore model parsers wholesale in Phase 1.
4. Standardize repository error types and offline fallbacks.

---

## 5. Navigation architecture

### Root

`RootNavigator` → `Auth | PlayerApp | ScoutApp | GuestApp`

Role resolution: unauthenticated → Auth; guest → PlayerApp; scout/coach → ScoutApp; else PlayerApp.

### Player tabs (current)

| Route id | Label | Content |
|----------|-------|---------|
| Home | Home | Profile hub / Passport score / onboarding |
| Performance | **Growth** | Stats \| Career segments |
| Media | Media | Highlights \| GPS |
| Discover | Discover | Browse-only discovery |
| Center FAB | Log Match | Opens `LogMatchModal` |

Stack: PublicPortfolio, CareerReplay, Settings, Trials, PlayerDetail, auth upgrade screens.

### Scout tabs (current)

Dashboard · Discover · Pipeline · Trials (Trials \| Reports)

Stack: PlayerDetail, Comparison, ActivityInbox, PublicPortfolio, Settings.

### Audit verdict

- Route id `Performance` vs label “Growth” is confusing for engineers — rename in Phase 4.
- Home is a **static profile hub**, not a dynamic **Today** dashboard (V2 requirement).
- Trials buried on stack for players; on tab for scouts — asymmetric but workable; re-evaluate in IA phase.
- Discover on player shell is valuable for browse; keep, but clarify browse-only UX.

**Proposed V2 IA (validate in Phase 4, do not implement yet):**

Player: Today · Growth · Media · Passport · Discover (+ Log Match FAB)  
Scout: Dashboard · Discover · Pipeline · Trials · Activity (or keep Activity as stack)

---

## 6. Provider / state topology

| Provider | Scope | Notes |
|----------|-------|-------|
| `AuthProvider` | Root | Session, role, upgrade intent |
| `ThemeProvider` | Root | Light/dark + CSS vars |
| `PlayerWorkspaceProvider` | PlayerApp | Profile + trust + portfolio preview |
| `ScoutWorkspaceProvider` | ScoutApp / Player Discover | AsyncStorage workspace |
| `RecruitmentProvider` | ScoutApp | Pipeline |
| `ScoutFlowProvider` | ScoutApp | Search, filters, scope, presets |

**Issues:**

- No global server-state cache → duplicate fetches / listener sprawl risk.
- Scout workspace + recruitment both persist “saved players” concepts historically (partially cleaned; verify no dual-write leftovers in Phase 2).
- Guest Discover uses in-memory workspace when `scoutId` is null — recent searches don’t persist (acceptable for guests).

---

## 7. Backend architecture

### Client Firebase

- Primary: **Firebase JS SDK** (`firebase` package) for Auth/Firestore/Storage/Functions.
- Secondary: **`@react-native-firebase/app` + `app-check`** for App Check in native builds.
- Expo Go stubs RNFirebase modules.

**Risk:** Dual-stack complexity during SDK 57 migration. Prefer consolidating App Check strategy after SDK upgrade.

### Cloud Functions (`functions/src`)

| Export | Purpose |
|--------|---------|
| `generateAiInsight` | AI coach |
| `analyzeMatchFootage` | Match video AI |
| `scheduleWeeklyFootballReports` | Weekly summary |
| `recordPortfolioView` | Analytics |
| `onActivityCreatedPush` | Expo push on activities |
| Admin review callables | Moderation |
| Apple auth helpers | Account delete / Apple code |

Node engine: **20** in `functions/package.json` — SDK 57 client wants Node **22.13+** for tooling; bump Functions runtime separately when ready.

### Data access smell

Discovery: load pages ordered by `updatedAt`, then **client-filter**. Fine at small scale; design for Algolia/Typesense later without rewriting UI.

---

## 8. Styling architecture

- NativeWind v4 + `tailwind.config.js` (`darkMode: 'class'`).
- Theme tokens in `src/theme/tokens/colors.ts` (warm paper / charcoal + gold + emerald).
- Known issue: CSS variables fail in some Modal/BottomSheet trees → primitives apply explicit `style={{ color }}`.

**V2:** Design system 2.0 must make portal/modal theming first-class so workarounds aren’t scattered.

Charts: custom **react-native-svg** (Radar, progress, GPS heatmap) — no Victory/GiftedCharts. Keep unless SDK 57 forces change; evaluate a maintained chart lib only if custom SVG becomes a maintenance tax.

---

## 9. Testing architecture

| Layer | Status |
|-------|--------|
| Jest / RNTL | **Not present** |
| Maestro | **Not present** |
| Playwright e2e | Minimal (`e2e/welcome.spec.ts`) |
| Typecheck / ESLint | Present and used |

Phase 25 must introduce unit + Maestro. Do not block Phase 1 on tests, but add smoke tests early in Phase 2.

---

## 10. Documentation gaps

Existing docs: Apple/Google Sign-In, App Check, Deep Linking, Secure Storage.

Missing (create during rebuild): architecture/, features/, firebase/, testing/, deployment/, rebuild/ (this folder).

README is essentially empty (`# PitchProof`).

---

## 11. Architecture decisions for V2 (proposed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Keep feature folders | Yes | Already correct |
| Keep React Navigation | Yes | Expo Router migration is optional/high risk mid-rebuild |
| Add React Query | Yes (Phase 2) | Spec requirement; fixes fetch chaos |
| Add Zod + RHF | Yes (forms Phase 5–8) | Match logging / onboarding |
| Keep Firebase | Yes | Core backend |
| Rewrite Firestore schema | No (incremental) | Migrate with dual-read |
| CNG / no committed native dirs | Yes | Keep |
| Expo Go as primary | No | Dev client after SDK 57 |

---

## 12. Phase 0 exit criteria

- [x] Architecture understood
- [ ] SDK 57 migration plan accepted (`SDK57_MIGRATION.md`)
- [ ] Feature classifications accepted (`FEATURE_AUDIT.md`)
- [ ] Roadmap accepted (`REBUILD_ROADMAP.md`)

**Next:** Phase 1 — SDK 57 migration only (no UI redesign).
