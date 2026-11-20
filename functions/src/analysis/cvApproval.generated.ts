// STAGING OVERLAY ONLY (scripts/pilot-staging/make-staging-overlay.sh). Never merge. Approves the staging fake worker
// so the real queue/handler/report path can run in the staging project without a GPU or models.
export type CvApproval = {
  workerVersion: string;
  models: Readonly<Record<string, string>>;
  eventsApproved: boolean;
  reportSha256: string;
};

export const APPROVED_CV_WORKER: CvApproval | null = {
  workerVersion: 'football-cv/0.7.0-staging',
  models: { detector: 'yolox-staging', ocr: 'parseq-staging' },
  eventsApproved: false,
  reportSha256: 'staging-overlay-no-evaluation',
};
