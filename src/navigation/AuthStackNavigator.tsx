import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '@/features/auth/screens/WelcomeScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { AuthActionScreen } from '@/features/auth/screens/AuthActionScreen';
import { CompletePasswordResetScreen } from '@/features/auth/screens/CompletePasswordResetScreen';
import { RoleSelectionScreen } from '@/features/auth/screens/RoleSelectionScreen';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type AuthStackParamList } from '@/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator<AuthStackParamList>();

function WelcomeRoute({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Welcome'>) {
  const { signInAsGuest, signInWithApple, signInWithGoogle, isSubmitting } = useAuth();
  return (
    <WelcomeScreen
      onGetStarted={() => navigation.navigate('Register')}
      onSignIn={() => navigation.navigate('Login')}
      onContinueAsGuest={() => void signInAsGuest()}
      onSignInWithApple={() => void signInWithApple()}
      onSignInWithGoogle={() => void signInWithGoogle()}
      isSubmitting={isSubmitting}
    />
  );
}

function LoginRoute({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Login'>) {
  const { signIn, signInWithApple, signInWithGoogle, isSubmitting, error, successMessage } = useAuth();
  return (
    <LoginScreen
      onSubmit={signIn}
      onBack={() => navigation.goBack()}
      onForgotPassword={() => navigation.navigate('ForgotPassword')}
      onSignInWithApple={() => void signInWithApple()}
      onSignInWithGoogle={() => void signInWithGoogle()}
      isSubmitting={isSubmitting}
      error={error}
      successMessage={successMessage}
    />
  );
}

function RegisterRoute({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Register'>) {
  const { signUp, signInWithApple, signInWithGoogle, isSubmitting, error } = useAuth();
  return (
    <RegisterScreen
      onSubmit={signUp}
      onBack={() => navigation.goBack()}
      onSignInWithApple={() => void signInWithApple()}
      onSignInWithGoogle={() => void signInWithGoogle()}
      isSubmitting={isSubmitting}
      error={error}
    />
  );
}

function ForgotPasswordRoute({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>) {
  const { forgotPassword, isSubmitting, error, successMessage } = useAuth();
  return (
    <ForgotPasswordScreen
      onSubmit={forgotPassword}
      onBack={() => navigation.goBack()}
      isSubmitting={isSubmitting}
      error={error}
      successMessage={successMessage}
    />
  );
}

function RoleSelectionRoute({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, 'RoleSelection'>) {
  const { selectRole, successMessage } = useAuth();
  return (
    <RoleSelectionScreen
      onContinue={(role) => {
        selectRole(role);
      }}
      onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Welcome')}
      successMessage={successMessage}
    />
  );
}

export type AuthStackNavigatorProps = {
  initialRouteName?: keyof AuthStackParamList;
};

export function AuthStackNavigator({ initialRouteName = 'Welcome' }: AuthStackNavigatorProps) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeRoute} />
      <Stack.Screen name="Login" component={LoginRoute} />
      <Stack.Screen name="Register" component={RegisterRoute} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordRoute} />
      <Stack.Screen name="AuthAction" component={AuthActionScreen} />
      <Stack.Screen name="CompletePasswordReset" component={CompletePasswordResetScreen} />
      <Stack.Screen name="RoleSelection" component={RoleSelectionRoute} />
    </Stack.Navigator>
  );
}
