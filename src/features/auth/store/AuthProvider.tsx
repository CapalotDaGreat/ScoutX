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
import { useAuthSession } from '@/features/auth/hooks/useAuthSession';
import {
  resetPasswordWithFirebase,
  signInWithFirebase,
  signOutFromFirebase,
  signUpWithFirebase,
} from '@/features/auth/services/authService';
import {
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
  pendingRoleSelection: boolean;
  isSubmitting: boolean;
  error: string | null;
  successMessage: string | null;
  signIn: (payload: SignInPayload) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  forgotPassword: (payload: ForgotPasswordPayload) => Promise<void>;
  selectRole: (role: AuthRole) => void;
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
  isSubmitting: false,
  error: null,
  successMessage: null,
};

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, isLoading } = useAuthSession();
  const [state, setState] = useState<AuthState>(initialState);

  const syncSession = useCallback(() => {
    setState((current) => ({
      ...current,
      status: isLoading ? 'loading' : user ? 'authenticated' : 'unauthenticated',
      user,
      role: user?.role ?? null,
      pendingRoleSelection: Boolean(user && !user.role),
      error: null,
    }));
  }, [isLoading, user]);

  useEffect(() => {
    syncSession();
  }, [syncSession]);

  const clearMessages = useCallback(() => {
    setState((current) => ({ ...current, error: null, successMessage: null }));
  }, []);

  const signIn = useCallback(async (payload: SignInPayload) => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      const user = await signInWithFirebase(payload);
      setState({
        status: 'authenticated',
        user,
        role: user.role ?? null,
        pendingRoleSelection: !user.role,
        isSubmitting: false,
        error: null,
        successMessage: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      setState((current) => ({ ...current, isSubmitting: false, error: message }));
    }
  }, []);

  const signUp = useCallback(async (payload: SignUpPayload) => {
    setState((current) => ({ ...current, isSubmitting: true, error: null, successMessage: null }));

    try {
      const user = await signUpWithFirebase(payload);
      setState({
        status: 'authenticated',
        user,
        role: null,
        pendingRoleSelection: true,
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

  const selectRole = useCallback((role: AuthRole) => {
    const userId = state.user?.id;
    if (userId) {
      const db = getFirestoreDb();
      if (db) {
        void setDoc(doc(db, 'users', userId), { role, updatedAt: new Date().toISOString() }, { merge: true })
          .catch((err) => console.error('Error saving role to Firestore:', err));
      }
    }

    setState((current) => ({
      ...current,
      role,
      pendingRoleSelection: false,
      user: current.user ? { ...current.user, role } : current.user,
      successMessage: `You’re ready to explore ScoutX as a ${role}.`,
    }));
  }, [state.user?.id]);

  const signOut = useCallback(async () => {
    setState((current) => ({ ...current, isSubmitting: true }));
    await signOutFromFirebase();
    setState({
      status: 'unauthenticated',
      user: null,
      role: null,
      pendingRoleSelection: false,
      isSubmitting: false,
      error: null,
      successMessage: 'Signed out successfully.',
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      role: state.role,
      pendingRoleSelection: state.pendingRoleSelection,
      isSubmitting: state.isSubmitting,
      error: state.error,
      successMessage: state.successMessage,
      signIn,
      signUp,
      forgotPassword,
      selectRole,
      signOut,
      clearMessages,
    }),
    [clearMessages, forgotPassword, selectRole, signIn, signOut, signUp, state.error, state.isSubmitting, state.pendingRoleSelection, state.role, state.status, state.successMessage, state.user],
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
