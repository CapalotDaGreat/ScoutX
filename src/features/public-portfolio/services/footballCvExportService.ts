import * as Print from 'expo-print';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { buildFootballCvHtml } from '@/features/public-portfolio/services/footballCvHtml';
import { shareFileUri } from '@/features/share-cards/services/shareCardService';

export class PortfolioExportNotPublicError extends Error {
  constructor() {
    super('Football CV export requires a public Football Passport.');
    this.name = 'PortfolioExportNotPublicError';
  }
}

export async function exportFootballCvPdf(data: PublicPortfolioData): Promise<void> {
  const built = buildFootballCvHtml(data);
  if (!built) {
    throw new PortfolioExportNotPublicError();
  }
  const file = await Print.printToFileAsync({ html: built.html });
  await shareFileUri(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `${built.fullName} — Football CV`,
  });
}
