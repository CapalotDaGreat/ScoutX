import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { isGuestRole } from '@/features/auth/services/authAccess';
import { useAuthSession } from '@/features/auth/hooks/useAuthSession';
import {
  resetPasswordWithFirebase,
  signInAnonymouslyWithFirebase,
  signInWithFirebase,
  signOutFromFirebase,
  signUpWithFirebase,
} from '@/features/auth/services/authService';
import { signInWithAppleFirebase } from '@/features/auth/services/appleAuthService';
import {
  type AccountUpgradeIntent,
  type AuthRole,
  type AuthStatus,
  type AuthUser,
  type ForgotPasswordPayload,
  type SignInPayload,
  type SignUpPayload,
} from '@/features/auth/types';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  role: AuthRole | null;
  isGuest: boolean;
  pendingRoleSelection: boolean;
  upgradeIntent: AccountUpgradeIntent | null;
  isSubmitting: boolean;
  error: string | null;
  successMessage: string | null;
  signIn: (payload: SignInPayload) => Promise<void>;
  signInWithApple: () => Promise<void>;
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

  const syncSession = useCallback(() => {
    const isGuest = isGuestRole(user?.role, user?.isAnonymous);
    const pendingRoleSelection = Boolean(
      user && !isGuest && (user.role === undefined || (user.role !== 'player' && user.role !== 'scout')),
    );

    setState((current) => ({
      ...current,
      status: isLoading ? 'loading' : user ? 'authenticated' : 'unauthenticated',
      user,
      role: user?.role ?? null,
      pendingRoleSelection,
      error: current.isSubmitting ? current.error : null,
    }));
  }, [isLoading, user]);

  useEffect(() => {
    syncSession();
  }, [syncSession]);

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
        successMessage: 'A recovery link has been prepared for your email.',
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
          { role, isAnonymous: false, updatedAt: new Date().toISOString() },
          { merge: true },
        ).catch((err) => console.error('Error saving role to Firestore:', err));
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
    setState((current) => ({ ...current, isSubmitting: true }));
    await signOutFromFirebase();
    setState({
      status: 'unauthenticated',
      user: null,
      role: null,
      pendingRoleSelection: false,
      upgradeIntent: null,
      isSubmitting: false,
      error: null,
      successMessage: 'Signed out successfully.',
    });
  }, []);

  const isGuest = isGuestRole(state.role ?? undefined, state.user?.isAnonymous);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      role: state.role,
      isGuest,
      pendingRoleSelection: state.pendingRoleSelection,
      upgradeIntent: state.upgradeIntent,
      isSubmitting: state.isSubmitting,
      error: state.error,
      successMessage: state.successMessage,
      signIn,
      signInWithApple,
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
      isGuest,
      selectRole,
      signIn,
      signInWithApple,
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
