import { useMemo, useState } from 'react';
import { WelcomeScreen } from '@/features/auth/screens/WelcomeScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { RoleSelectionScreen } from '@/features/auth/screens/RoleSelectionScreen';
import { SessionLoadingScreen } from '@/features/auth/screens/SessionLoadingScreen';
import { AuthenticatedScreen } from '@/features/auth/screens/AuthenticatedScreen';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type AuthRole, type ForgotPasswordPayload, type SignInPayload, type SignUpPayload } from '@/features/auth/types';

export type AuthScreen = 'welcome' | 'login' | 'register' | 'forgot-password' | 'role-selection' | 'loading';

export function AuthNavigator() {
  const { status, pendingRoleSelection, isSubmitting, error, successMessage, signIn, signUp, forgotPassword, selectRole, clearMessages, signOut } = useAuth();
  const [screen, setScreen] = useState<AuthScreen>('welcome');

  const currentScreen = useMemo(() => {
    if (status === 'loading') {
      return 'loading';
    }

    if (pendingRoleSelection) {
      return 'role-selection';
    }

    return screen;
  }, [pendingRoleSelection, screen, status]);

  const handleNavigate = (nextScreen: AuthScreen) => {
    clearMessages();
    setScreen(nextScreen);
  };

  if (currentScreen === 'loading') {
    return <SessionLoadingScreen />;
  }

  if (status === 'authenticated') {
    return <AuthenticatedScreen onSignOut={signOut} />;
  }

  if (currentScreen === 'role-selection') {
    return (
      <RoleSelectionScreen
        onContinue={(role: AuthRole) => {
          selectRole(role);
          setScreen('welcome');
        }}
        onBack={() => handleNavigate('welcome')}
        successMessage={successMessage}
      />
    );
  }

  if (currentScreen === 'login') {
    return (
      <LoginScreen
        onSubmit={async (payload: SignInPayload) => {
          await signIn(payload);
        }}
        onBack={() => handleNavigate('welcome')}
        onForgotPassword={() => handleNavigate('forgot-password')}
        isSubmitting={isSubmitting}
        error={error}
        successMessage={successMessage}
      />
    );
  }

  if (currentScreen === 'register') {
    return (
      <RegisterScreen
        onSubmit={async (payload: SignUpPayload) => {
          await signUp(payload);
        }}
        onBack={() => handleNavigate('welcome')}
        isSubmitting={isSubmitting}
        error={error}
      />
    );
  }

  if (currentScreen === 'forgot-password') {
    return (
      <ForgotPasswordScreen
        onSubmit={async (payload: ForgotPasswordPayload) => {
          await forgotPassword(payload);
        }}
        onBack={() => handleNavigate('login')}
        isSubmitting={isSubmitting}
        error={error}
        successMessage={successMessage}
      />
    );
  }

  return (
    <WelcomeScreen
      onGetStarted={() => handleNavigate('register')}
      onSignIn={() => handleNavigate('login')}
    />
  );
}
