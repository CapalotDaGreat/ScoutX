import './global.css';
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
import { AmbientBackdrop } from '@/components/layout/AmbientBackdrop';
import { FirebaseBootstrap } from '@/components/bootstrap/FirebaseBootstrap';
import { initSentry, wrapWithSentry } from '@/config/sentry';
import { ThemeProvider, useTheme } from '@/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/features/auth/store/AuthProvider';
import { RootNavigator } from '@/navigation';
import { AiInsightsProvider } from '@/features/ai-insights';
import { ActivityProvider } from '@/features/activity-feed';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { AgentationDevProbe } from '@/dev/AgentationDevProbe';

enableScreens();
initSentry();

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
      <AuthProvider>
        <ActivityProvider>
          <AiInsightsProvider>
            <RootNavigator />
          </AiInsightsProvider>
        </ActivityProvider>
      </AuthProvider>
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
              <View className="flex-1 bg-background">
                <AmbientBackdrop />
                <View className="flex-1 bg-transparent">
                  <AppContent />
                </View>
              </View>
              {__DEV__ ? <AgentationDevProbe /> : null}
            </FirebaseBootstrap>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(App);
