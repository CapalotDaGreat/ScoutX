import type { AuthCredential } from 'firebase/auth';

/** Firebase OAuth provider IDs supported by ScoutX account linking. */
export type SupportedOAuthProviderId = 'apple.com' | 'google.com';

export type OAuthCredentialBundle = {
  providerId: SupportedOAuthProviderId;
  credential: AuthCredential;
  displayName?: string;
  email?: string;
  /** Short-lived Apple authorization code — exchange server-side immediately. */
  appleAuthorizationCode?: string;
  /** Stable Apple user identifier for credential-state checks. */
  appleUserId?: string;
};

export type OAuthLinkContext = {
  displayName?: string;
  email?: string;
};
