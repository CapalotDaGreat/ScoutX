import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { isGuestRole } from '@/features/auth/services/authAccess';
import { useAuthSession } from '@/features/auth/hooks/useAuthSession';
import {
  resetPasswordWithFirebase,
  getPasswordResetSuccessMessage,
  signInAnonymouslyWithFirebase,
  signInWithFirebase,
  signOutFromFirebase,
  signUpWithFirebase,
} from '@/features/auth/services/authService';
import { mockSignInAsGuest } from '@/features/auth/services/mockAuthService';
import { signInWithAppleFirebase } from '@/features/auth/services/appleAuthService';
import { signInWithGoogleFirebase } from '@/features/auth/services/googleAuthService';
import { useAppleCredentialRevokeListener } from '@/features/auth/hooks/useAppleCredentialRevokeListener';
import {
  type AccountUpgradeIntent,
  type AuthRole,
  type AuthStatus,
  type AuthUser,
  type ForgotPasswordPayload,
  type SignInPayload,
  type SignUpPayload,
} from '@/features/auth/types';

const ANONYMOUS_BOOTSTRAP_TIMEOUT_MS = 8_000;

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  role: AuthRole | null;
  isGuest: boolean;
  isBootstrappingSession: boolean;
  pendingRoleSelection: boolean;
  upgradeIntent: AccountUpgradeIntent | null;
  isSubmitting: boolean;
  error: string | null;
  successMessage: string | null;
  signIn: (payload: SignInPayload) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  forgotPassword: (payload: ForgotPasswordPayload) => Promise<void>;
  selectRole: (role: 'player' | 'scout') => void;
  beginUpgrade: (intent: AccountUpgradeIntent) => void;
  clearUpgrade: () => void;
  signOut: () => Promise<void>;
  clearMessages: () => void;
};

type AuthProviderProps = {
  children: ReactNode;
};

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  role: AuthRole | null;
  pendingRoleSelection: boolean;
  upgradeIntent: AccountUpgradeIntent | null;
  isSubmitting: boolean;
  error: string | null;
  successMessage: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthState = {
  status: 'loading',
  user: null,
  role: null,
  pendingRoleSelection: false,
  upgradeIntent: null,
  isSubmitting: false,
  error: null,
  successMessage: null,
};

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, isLoading } = useAuthSession();
  const [state, setState] = useState<AuthState>(initialState);
  const [isEnsuringAnonymousSession, setIsEnsuringAnonymousSession] = useState(false);
  const [anonymousBootstrapFailed, setAnonymousBootstrapFailed] = useState(false);
  const anonymousBootstrapStartedRef = useRef(false);

  const syncSession = useCallback(() => {
    if (isLoading) {
      setState((current) => {
        if (current.status === 'authenticated' && current.user) {
          return current;
        }

        return {
          ...current,
          status: 'loading',
          error: current.isSubmitting ? current.error : null,
        };
      });
      return;
    }

    if (!user) {
      setState((current) => {
        // Keep a local anonymous/mock session while the Firebase listener catches up.
        if (current.status === 'authenticated' && current.user) {
          return current;
        }

        if (isEnsuringAnonymousSession) {
          return {
            ...current,
            status: 'loading',
            error: current.isSubmitting ? current.error : null,
          };
        }

        return {
          ...current,
          status: 'unauthenticated',
          user: null,
          role: null,
          pendingRoleSelection: false,
          error: current.isSubmitting ? current.error : null,
        };
      });
      return;
    }

    const isGuest = isGuestRole(user.role, user.isAnonymous);
    const pendingRoleSelection = Boolean(
      !isGuest && (user.role === undefined || (user.role !== 'player' && user.role !== 'scout')),
    );

    setState((current) => ({
      ...current,
      status: 'authenticated',
      user,
      role: user.role ?? null,
      pendingRoleSelection,
      error: current.isSubmitting ? current.error : null,
    }));
  }, [isEnsuringAnonymousSession, isLoading, user]);

  useEffect(() => {
    syncSession();
  }, [syncSession]);

  useEffect(() => {
    if (
      isLoading ||
      user ||
      anonymousBootstrapStartedRef.current ||
      anonymousBootstrapFailed
    ) {
      return;
    }

    let cancelled = false;
    anonymousBootstrapStartedRef.current = true;
    setIsEnsuringAnonymousSession(true);

    const finishAsGuest = (nextUser: AuthUser) => {
      setAnonymousBootstrapFailed(false);
      setState({
        status: 'authenticated',
        user: nextUser,
        role: 'guest',
        pendingRoleSelection: false,
        upgradeIntent: null,
        isSubmitting: false,
        error: null,
        successMessage: null,
      });
    };

    const failBootstrap = (message: string) => {
      setState((current) => ({
        ...current,
        status: 'unauthenticated',
        error: message,
      }));
      setAnonymousBootstrapFailed(true);
    };

    const bootstrapTimeout = setTimeout(() => {
      if (cancelled) {
        return;
      }

      void mockSignInAsGuest()
        .then((guestUser) => {
          if (!cancelled) {
            if (__DEV__) {
              console.warn(
                '[auth] Anonymous Firebase bootstrap timed out — using local guest session.',
              );
            }
            finishAsGuest(guestUser);
          }
        })
        .catch(() => {
          if (!cancelled) {
            failBootstrap('Unable to start your session. Check your connection and try again.');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsEnsuringAnonymousSession(false);
          }
        });
    }, ANONYMOUS_BOOTSTRAP_TIMEOUT_MS);

    void signInAnonymouslyWithFirebase()
      .then((nextUser) => {
        if (cancelled) {
          return;
        }

        clearTimeout(bootstrapTimeout);
        finishAsGuest(nextUser);
        setIsEnsuringAnonymousSession(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        clearTimeout(bootstrapTimeout);

        void mockSignInAsGuest()
          .then((guestUser) => {
            if (cancelled) {
              return;
            }
            if (__DEV__) {
              console.warn(
                '[auth] Anonymous Firebase sign-in failed — using local guest session.',
                error,
              );
            }
            finishAsGuest(guestUser);
          })
          .catch(() => {
            if (cancelled) {
              return;
            }
            const message =
              error instanceof Error ? error.message : 'Unable to start your session.';
            failBootstrap(message);
          })
          .finally(() => {
            if (!cancelled) {
              setIsEnsuringAnonymousSession(false);
            }
          });
      });

    return () => {
      cancelled = true;
      clearTimeout(bootstrapTimeout);
    };
  }, [anonymousBootstrapFailed, isLoading, user]);

  const clearMessages = useCallback(() => {
    setState((current) => ({ ...current, error: null, successMessage: null }));
  }, []);

  const signInAsGuest = useCallback(async () => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      const nextUser = await signInAnonymouslyWithFirebase();
      setState({
        status: 'authenticated',
        user: nextUser,
        role: 'guest',
        pendingRoleSelection: false,
        upgradeIntent: null,
        isSubmitting: false,
        error: null,
        successMessage: 'Welcome to ScoutX guest mode.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to continue as guest.';
      setState((current) => ({ ...current, isSubmitting: false, error: message }));
    }
  }, []);

  const signIn = useCallback(async (payload: SignInPayload) => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      const nextUser = await signInWithFirebase(payload);
      setState({
        status: 'authenticated',
        user: nextUser,
        role: nextUser.role ?? null,
        pendingRoleSelection: !isGuestRole(nextUser.role, nextUser.isAnonymous) && !nextUser.role,
        upgradeIntent: null,
        isSubmitting: false,
        error: null,
        successMessage: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      setState((current) => ({ ...current, isSubmitting: false, error: message }));
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      const nextUser = await signInWithAppleFirebase();
      if (!nextUser) {
        setState((current) => ({ ...current, isSubmitting: false }));
        return;
      }

      setState({
        status: 'authenticated',
        user: nextUser,
        role: nextUser.role ?? null,
        pendingRoleSelection: !isGuestRole(nextUser.role, nextUser.isAnonymous) && !nextUser.role,
        upgradeIntent: null,
        isSubmitting: false,
        error: null,
        successMessage: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in with Apple.';
      setState((current) => ({ ...current, isSubmitting: false, error: message }));
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      const nextUser = await signInWithGoogleFirebase();
      if (!nextUser) {
        setState((current) => ({ ...current, isSubmitting: false }));
        return;
      }

      setState({
        status: 'authenticated',
        user: nextUser,
        role: nextUser.role ?? null,
        pendingRoleSelection: !isGuestRole(nextUser.role, nextUser.isAnonymous) && !nextUser.role,
        upgradeIntent: null,
        isSubmitting: false,
        error: null,
        successMessage: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in with Google.';
      setState((current) => ({ ...current, isSubmitting: false, error: message }));
    }
  }, []);

  const signUp = useCallback(async (payload: SignUpPayload) => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      const nextUser = await signUpWithFirebase(payload);
      setState({
        status: 'authenticated',
        user: nextUser,
        role: nextUser.role ?? null,
        pendingRoleSelection: true,
        upgradeIntent: null,
        isSubmitting: false,
        error: null,
        successMessage: 'Welcome to ScoutX. Choose your role to continue.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to register.';
      setState((current) => ({ ...current, isSubmitting: false, error: message }));
    }
  }, []);

  const forgotPassword = useCallback(async (payload: ForgotPasswordPayload) => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      await resetPasswordWithFirebase(payload);
      setState((current) => ({
        ...current,
        isSubmitting: false,
        successMessage: getPasswordResetSuccessMessage(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send reset instructions.';
      setState((current) => ({ ...current, isSubmitting: false, error: message }));
    }
  }, []);

  const selectRole = useCallback((role: 'player' | 'scout') => {
    const userId = state.user?.uid;
    if (userId) {
      const db = getFirestoreDb();
      if (db) {
        void setDoc(
          doc(db, 'users', userId),
          { role, roleConfirmed: true, isAnonymous: false, updatedAt: new Date().toISOString() },
          { merge: true },
        ).catch(() => {
          if (__DEV__) {
            console.error('Error saving role to Firestore.');
          }
        });
      }
    }

    setState((current) => ({
      ...current,
      role,
      pendingRoleSelection: false,
      upgradeIntent: null,
      user: current.user ? { ...current.user, role, isAnonymous: false } : current.user,
      successMessage: `You’re ready to explore ScoutX as a ${role}.`,
    }));
  }, [state.user?.uid]);

  const beginUpgrade = useCallback((intent: AccountUpgradeIntent) => {
    setState((current) => ({
      ...current,
      upgradeIntent: intent,
      error: null,
      successMessage: null,
    }));
  }, []);

  const clearUpgrade = useCallback(() => {
    setState((current) => ({ ...current, upgradeIntent: null, error: null }));
  }, []);

  const signOut = useCallback(async () => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));
    await signOutFromFirebase();

    try {
      const nextUser = await signInAnonymouslyWithFirebase().catch(() => mockSignInAsGuest());
      setState({
        status: 'authenticated',
        user: nextUser,
        role: 'guest',
        pendingRoleSelection: false,
        upgradeIntent: null,
        isSubmitting: false,
        error: null,
        successMessage: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to restart your session.';
      setState({
        status: 'unauthenticated',
        user: null,
        role: null,
        pendingRoleSelection: false,
        upgradeIntent: null,
        isSubmitting: false,
        error: message,
        successMessage: null,
      });
    }
  }, []);

  useAppleCredentialRevokeListener(() => {
    void signOut();
  });

  const isGuest = isGuestRole(state.role ?? undefined, state.user?.isAnonymous);
  const isBootstrappingSession =
    state.status === 'loading' && isLoading;

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      role: state.role,
      isGuest,
      isBootstrappingSession,
      pendingRoleSelection: state.pendingRoleSelection,
      upgradeIntent: state.upgradeIntent,
      isSubmitting: state.isSubmitting,
      error: state.error,
      successMessage: state.successMessage,
      signIn,
      signInWithApple,
      signInWithGoogle,
      signUp,
      signInAsGuest,
      forgotPassword,
      selectRole,
      beginUpgrade,
      clearUpgrade,
      signOut,
      clearMessages,
    }),
    [
      beginUpgrade,
      clearMessages,
      clearUpgrade,
      forgotPassword,
      isBootstrappingSession,
      isGuest,
      selectRole,
      signIn,
      signInWithApple,
      signInWithGoogle,
      signInAsGuest,
      signOut,
      signUp,
      state.error,
      state.isSubmitting,
      state.pendingRoleSelection,
      state.role,
      state.status,
      state.successMessage,
      state.upgradeIntent,
      state.user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
