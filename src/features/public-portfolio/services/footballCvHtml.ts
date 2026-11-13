import { buildPublicPortfolioUrl } from '@/features/public-portfolio/constants';
import { filterPortfolioForPublicExport, isPortfolioSectionVisible } from '@/features/public-portfolio/models/PortfolioModel';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { formatRating } from '@/features/player-statistics/utils/recordedStats';
import { lightColors } from '@/theme/tokens/colors';
import { escapeHtml } from '@/utils/htmlEscape';

export type FootballCvDocument = { html: string; fullName: string };

/**
 * Builds the Football CV as printable HTML. Pure: no native modules, so it can be unit-tested and rendered in a browser.
 * Returns null when the Passport is not public. Hidden sections are named as private, never filled in or left blank.
 * Empty profile fields are left out rather than printed as separators or placeholders.
 */
export function buildFootballCvHtml(data: PublicPortfolioData): FootballCvDocument | null {
  const filtered = filterPortfolioForPublicExport(data);
  if (!filtered) return null;

  const { profile, recommendations, privacy } = filtered;
  const url = buildPublicPortfolioUrl(profile.id, profile.username ?? null);
  const showStats = isPortfolioSectionVisible(privacy, 'statistics');
  const showRecs = isPortfolioSectionVisible(privacy, 'recommendations');
  const c = lightColors;

  const matchRows = showStats
    ? (profile.statisticsMatches ?? [])
        .slice(-8)
        .map(
          (match) =>
            `<tr><td>${escapeHtml(match.date.slice(0, 10))}</td><td>${escapeHtml(match.opponent)}</td><td class="n">${match.goals}</td><td class="n">${match.assists}</td><td class="n">${formatRating(match.matchRating)}</td></tr>`,
        )
        .join('')
    : '';

  const recommendationBlocks = showRecs
    ? recommendations
        .slice(0, 4)
        .map(
          (item) =>
            `<div class="rec"><strong>${escapeHtml([item.authorName, item.authorOrganization].filter((part) => part?.trim()).join(' · '))}</strong><p>${escapeHtml(item.body)}</p></div>`,
        )
        .join('')
    : '';

  const statsSection = showStats
    ? `<h2>Recent matches</h2>
        <table>
          <thead><tr><th>Date</th><th>Opponent</th><th class="n">Goals</th><th class="n">Assists</th><th class="n">Rating</th></tr></thead>
          <tbody>${matchRows || '<tr><td colspan="5">No matches logged yet.</td></tr>'}</tbody>
        </table>
        <p class="note">Player-entered match log. A dash means not recorded.</p>`
    : '<h2>Recent matches</h2><p>Match statistics are private on this Passport.</p>';

  const recsSection = showRecs
    ? `<h2>Coach endorsements</h2>${recommendationBlocks || '<p>No endorsements yet.</p>'}`
    : '<h2>Coach endorsements</h2><p>Endorsements are private on this Passport.</p>';

  const position = profile.position?.trim();
  const meta = [profile.club, profile.nationality].filter((part) => part?.trim()).map((part) => escapeHtml(part)).join(' · ');
  const biography = profile.biography?.trim();

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 0; }
          * { box-sizing: border-box; }
          body { font-family: Helvetica, Arial, sans-serif; color: ${c.textPrimary}; margin: 0; background: ${c.surface}; font-size: 13px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .head { background: ${c.pitch}; color: ${c.onPitch}; padding: 36px 40px 30px; }
          .kicker { font-size: 11px; font-weight: 700; color: ${c.highlight}; }
          h1 { margin: 10px 0 8px; font-size: 34px; line-height: 1.1; overflow-wrap: anywhere; }
          .pos { display: inline-block; background: ${c.highlight}; color: ${c.highlightForeground}; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-right: 8px; }
          .meta { color: ${c.onPitchMuted}; font-size: 13px; }
          .body { padding: 8px 40px 36px; }
          h2 { margin: 26px 0 8px; font-size: 15px; color: ${c.accent}; }
          p { margin: 6px 0; overflow-wrap: anywhere; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          td, th { border-bottom: 1px solid ${c.border}; padding: 8px 6px; text-align: left; font-size: 12px; overflow-wrap: anywhere; }
          th { color: ${c.textSecondary}; font-weight: 600; }
          .n { text-align: right; white-space: nowrap; }
          tr, .rec { page-break-inside: avoid; }
          .rec { border-left: 3px solid ${c.accent}; padding-left: 12px; margin: 12px 0; }
          .note { font-size: 11px; color: ${c.textSecondary}; }
          .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid ${c.border}; font-size: 11px; color: ${c.textSecondary}; }
          a { color: ${c.accent}; overflow-wrap: anywhere; }
        </style>
      </head>
      <body>
        <div class="head">
          <div class="kicker">PitchProof Football CV</div>
          <h1>${escapeHtml(profile.fullName)}</h1>
          <div class="meta">${position ? `<span class="pos">${escapeHtml(position)}</span>` : ''}${meta}</div>
        </div>
        <div class="body">
          ${biography ? `<h2>About</h2><p>${escapeHtml(biography)}</p>` : ''}
          ${statsSection}
          ${recsSection}
          <div class="footer">Public Football Passport: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a><br />Downloaded copies cannot be recalled if you later hide sections.</div>
        </div>
      </body>
    </html>
  `;

  return { html, fullName: profile.fullName };
}
