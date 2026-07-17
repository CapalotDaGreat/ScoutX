import * as Print from 'expo-print';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { buildPublicPortfolioUrl } from '@/features/public-portfolio/constants';
import { shareFileUri } from '@/features/share-cards/services/shareCardService';
import { escapeHtml } from '@/utils/htmlEscape';

export async function exportFootballCvPdf(data: PublicPortfolioData): Promise<void> {
  const { profile, recommendations } = data;
  const username = profile.username ?? null;
  const url = buildPublicPortfolioUrl(profile.id, username);

  const matchRows = (profile.statisticsMatches ?? [])
    .slice(-8)
    .map(
      (match) =>
        `<tr><td>${escapeHtml(match.date.slice(0, 10))}</td><td>${escapeHtml(match.opponent)}</td><td>${match.goals}</td><td>${match.assists}</td><td>${match.matchRating.toFixed(1)}</td></tr>`,
    )
    .join('');

  const recommendationBlocks = recommendations
    .slice(0, 4)
    .map(
      (item) =>
        `<div class="rec"><strong>${escapeHtml(item.authorName)} · ${escapeHtml(item.authorOrganization)}</strong><p>${escapeHtml(item.body)}</p></div>`,
    )
    .join('');

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Helvetica, Arial, sans-serif; color: #151617; padding: 32px; background: #F7F6F3; }
          h1 { margin: 0 0 8px; font-size: 28px; }
          h2 { margin: 24px 0 8px; font-size: 16px; color: #2FBF71; text-transform: uppercase; letter-spacing: 1px; }
          .badge { display: inline-block; background: #F5EBD3; color: #D9A441; padding: 4px 10px; border-radius: 999px; font-size: 12px; margin-right: 8px; font-weight: 600; }
          .meta { color: #5C6570; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          td, th { border-bottom: 1px solid #E2E0DB; padding: 8px; text-align: left; font-size: 12px; }
          .rec { border-left: 3px solid #D9A441; padding-left: 12px; margin: 12px 0; }
          .footer { margin-top: 32px; font-size: 11px; color: #8B939E; }
        </style>
      </head>
      <body>
        <div class="badge">ScoutX Football CV</div>
        <h1>${escapeHtml(profile.fullName)}</h1>
        <div class="meta">${escapeHtml(profile.position)} · ${escapeHtml(profile.club)} · ${escapeHtml(profile.nationality)}</div>
        <p>${escapeHtml(profile.biography || 'Professional football portfolio powered by ScoutX.')}</p>
        <h2>Recent Matches</h2>
        <table>
          <thead><tr><th>Date</th><th>Opponent</th><th>G</th><th>A</th><th>Rating</th></tr></thead>
          <tbody>${matchRows || '<tr><td colspan="5">No matches logged yet.</td></tr>'}</tbody>
        </table>
        <h2>Coach Endorsements</h2>
        ${recommendationBlocks || '<p>No endorsements yet.</p>'}
        <div class="footer">Public Football Passport: ${escapeHtml(url)}</div>
      </body>
    </html>
  `;

  const file = await Print.printToFileAsync({ html });
  await shareFileUri(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `${profile.fullName} — Football CV`,
  });
}
