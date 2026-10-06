export type VerificationEntityType = 'player' | 'coach' | 'club';

export type VerificationRequestStatus = 'pending' | 'approved' | 'rejected';

export type VerificationRequest = {
  id: string;
  entityType: VerificationEntityType;
  entityId: string;
  requesterId: string;
  requesterName: string;
  status: VerificationRequestStatus;
  evidence: string;
  reviewerNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerificationRequestDraft = {
  entityType: VerificationEntityType;
  entityId: string;
  requesterName: string;
  evidence: string;
};

export type VerificationBadgeLevel = 'none' | 'basic' | 'verified';

export type VerificationDimension = 'identity' | 'club' | 'coach' | 'performance' | 'career';

export type EntityVerificationState = {
  entityId: string;
  entityType: VerificationEntityType;
  level: VerificationBadgeLevel;
  verifiedAt: string | null;
  dimensions: Record<VerificationDimension, VerificationBadgeLevel>;
};
