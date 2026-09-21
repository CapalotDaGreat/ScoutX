import './global.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { enableScreens } from 'react-native-screens';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import { LoadingScreen } from '@/components';
import { RoleAwareAmbientBackdrop } from '@/components/layout/RoleAwareAmbientBackdrop';
import { FirebaseBootstrap } from '@/components/bootstrap/FirebaseBootstrap';
import { initSentry, wrapWithSentry } from '@/config/sentry';
import { ThemeProvider, useTheme } from '@/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/features/auth/store/AuthProvider';
import { RootNavigator } from '@/navigation';
import { AiInsightsProvider } from '@/features/ai-insights';
import { ActivityProvider } from '@/features/activity-feed';
import { createExpoPushNotificationPort } from '@/features/notifications/services/expoPushNotificationPort';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { AgentationDevProbe } from '@/dev/AgentationDevProbe';
import { queryClient } from '@/data/queryClient';

enableScreens();
initSentry();

const pushNotificationPort = createExpoPushNotificationPort();

function AppContent() {
  const { t } = useAppTranslation('common');
  const { isDark } = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return <LoadingScreen message={t('loadingFonts')} />;
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <QueryClientProvider client={queryClient}>
        <ActivityProvider pushPort={pushNotificationPort}>
          <AiInsightsProvider>
            <RootNavigator />
          </AiInsightsProvider>
        </ActivityProvider>
      </QueryClientProvider>
    </>
  );
}

function App() {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <FirebaseBootstrap>
              <AuthProvider>
                <View className="flex-1">
                  <RoleAwareAmbientBackdrop />
                  <View className="flex-1 bg-transparent">
                    <AppContent />
                  </View>
                </View>
              </AuthProvider>
              {__DEV__ ? <AgentationDevProbe /> : null}
            </FirebaseBootstrap>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(App);
