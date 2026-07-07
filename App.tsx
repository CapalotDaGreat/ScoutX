import './global.css';
import { enableScreens } from 'react-native-screens';
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
import { initSentry, wrapWithSentry } from '@/config/sentry';
import { ThemeProvider } from '@/theme';
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
      <StatusBar style="auto" />
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
            <AppContent />
            {__DEV__ ? <AgentationDevProbe /> : null}
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(App);
