export type OnboardingStepId =
  | 'log_first_match'
  | 'claim_username'
  | 'enable_passport'
  | 'invite_coach'
  | 'enable_discoverable';

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  complete: boolean;
};

export type PlayerOnboardingReport = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
};
