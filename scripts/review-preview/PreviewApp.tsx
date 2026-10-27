/**
 * Development-only preview of the 4.0 Match Review with recorded worker output, for screenshots
 * and heuristic UX checks. Not part of the app bundle: it is only built by
 * scripts/review-preview/capture.mjs, which points the web export at this entry temporarily.
 *
 * URL hash: #<state>[&lang=<code>]  states: workspace | early | review | detailed | scout | coach | interrupted | player
 */
import '../../global.css';
import { useEffect, useState } from 'react';
import { Text as RNText, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { SnackbarProvider } from '@/components/feedback/Snackbar';
import { ThemeProvider } from '@/theme';
import { initI18n } from '@/i18n';
import type { SupportedLanguageCode } from '@/i18n/config';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import type { TrackingDoc, TrackingProgressDoc, TrackingReport } from '@/features/match-analysis/services/trackingPresentation';
import { MatchReviewView } from '@/features/match-review/components/MatchReviewView';
// Written by prepare.ts: the recorded worker output after validation by the real server parser.
import reports from './.generated/reports.json';

const REPORTS = reports as unknown as { auto: TrackingReport; answers: TrackingReport };

const NOW = Date.parse('2026-10-27T15:00:00Z');
function progress(done: number, total: number, extra: Partial<TrackingProgressDoc> = {}): TrackingProgressDoc {
  const plan = Array.from({ length: total }, (_, i) => ({ index: i, startSec: i === 0 ? 0 : 120 + (i - 1) * 300, endSec: i === 0 ? 120 : 120 + i * 300 }));
  const startedAt = new Date(NOW - 50 * 60_000).toISOString();
  const segments: TrackingProgressDoc['segments'] = {};
  plan.forEach((s, i) => {
    segments[String(i)] = i < done ? { status: 'done', attempts: 1, processingSec: 600, doneAt: new Date(NOW - (done - i) * 60_000).toISOString() }
      : i === done ? { status: 'running', attempts: 1 } : { status: 'queued', attempts: 0 };
  });
  return { generation: 1, durationSec: 2035, plan, segments, startedAt, updatedAt: new Date(NOW).toISOString(), resolving: null,
    preliminary: null, full: null, outcome: null, blocked: null, ...extra };
}

/** Illustrative synthetic actions (clearly not measured) to show the coach layout with drills. */
function synthetic(base: TrackingReport): TrackingReport {
  const m = (id: string, kind: 'pass_attempt' | 'carry' | 'contact', t: number, outcome?: 'completed' | 'incomplete') => ({
    id, kind, kinds: [kind], start: t, end: t + 2, clipStart: t - 4, clipEnd: t + 4, identityState: 'CONFIRMED_VISIBLE' as const,
    candidate: false, indicator: [] as Array<[number, number, number, number, number]>, ...(outcome ? { outcome } : {}) });
  return { ...base, coverage: { ...base.coverage, confirmedVisibleSec: 900 }, ball: { ...base.ball, contacts: 9 },
    events: [{ type: 'contact', start: 300, end: 301, identityState: 'CONFIRMED_VISIBLE' }],
    moments: [m('m_3000', 'pass_attempt', 300, 'completed'), m('m_6000', 'pass_attempt', 600, 'completed'), m('m_9000', 'carry', 900),
      m('m_12000', 'pass_attempt', 1200, 'incomplete'), m('m_15000', 'pass_attempt', 1500, 'incomplete'), m('m_18000', 'contact', 1800)] };
}

function scenario(state: string): { tracking: TrackingDoc | null; progress: TrackingProgressDoc | null; view?: 'simple' | 'detailed' | 'scout';
  momentId?: string; videoUrl?: string } {
  const auto = REPORTS.auto;
  const answers = REPORTS.answers;
  const doc = (report: TrackingReport, scope: 'preliminary' | 'full'): TrackingDoc => ({ report, version: 1, stale: false, scope, parts: 12 });
  switch (state) {
    case 'workspace':
      return { tracking: null, progress: progress(0, 8, { startedAt: new Date(NOW - 3 * 60_000).toISOString() }) };
    case 'early': {
      const p = progress(3, 8, { preliminary: { scope: 'preliminary', parts: 3, analysedEndSec: 720, moments: 2, reviewQuestions: 3, at: '' } });
      const early = { ...auto, moments: (auto.moments ?? []).filter((x) => x.clipEnd <= 720), analysedRange: { startSec: 0, endSec: 720, parts: 3 } };
      return { tracking: doc(early, 'preliminary'), progress: p };
    }
    case 'interrupted':
      return { tracking: null, progress: progress(4, 8, { outcome: 'interrupted' }) };
    case 'detailed':
      return { tracking: doc(answers, 'full'), progress: null, view: 'detailed' };
    case 'scout':
      return { tracking: doc(answers, 'full'), progress: null, view: 'scout' };
    case 'coach':
      return { tracking: doc(synthetic(auto), 'full'), progress: null };
    case 'player': {
      // The confirmed #20 moment at 32:36, rebased onto a 40 s excerpt of the recording (offset 1940 s).
      const off = 1940;
      const mm = (auto.moments ?? []).find((x) => x.identityState === 'CONFIRMED_VISIBLE');
      const rebased = mm ? { ...mm, start: mm.start - off, end: mm.end - off, clipStart: mm.clipStart - off, clipEnd: mm.clipEnd - off,
        indicator: mm.indicator.map((p) => [p[0] - off, p[1], p[2], p[3], p[4]] as [number, number, number, number, number]) } : null;
      return { tracking: doc({ ...auto, moments: rebased ? [rebased] : [] }, 'full'), progress: null, momentId: rebased?.id, videoUrl: './excerpt.mp4' };
    }
    case 'review-auto':
      return { tracking: doc(auto, 'full'), progress: null };
    default:
      return { tracking: doc(answers, 'full'), progress: null };
  }
}

export default function PreviewApp() {
  const [fonts] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [ready, setReady] = useState(false);
  const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(hash.replace(/^([^&=]+)(&|$)/, 'state=$1$2'));
  const state = params.get('state') ?? 'review';
  const lang = (params.get('lang') ?? 'en') as SupportedLanguageCode;
  useEffect(() => {
    void initI18n(lang).then(() => setReady(true));
  }, [lang]);
  if (!fonts || !ready) return <RNText>…</RNText>;
  const s = scenario(state);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <SnackbarProvider>
            <View style={{ padding: 16, paddingBottom: 48 }} className="bg-background">
              <View testID="preview-root">
                <MatchReviewView jobId="preview" playerId="preview-player" match={{ date: '2026-09-27', opponent: 'FC Example' }}
                  position="winger" job={{ videoDownloadUrl: s.videoUrl, durationSec: 2035 }} tracking={s.tracking} progress={s.progress}
                  goals={[]} initialView={s.view} initialMomentId={s.momentId} />
              </View>
            </View>
          </SnackbarProvider>
        </I18nextProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
