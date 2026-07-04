import './global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import { LoadingScreen } from '@/components';
import { ThemeProvider } from '@/theme';
import { AuthProvider } from '@/features/auth/store/AuthProvider';
import { AuthNavigator } from '@/features/auth/navigation/AuthNavigator';
import { AiInsightsProvider } from '@/features/ai-insights';

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <ThemeProvider>
          {!fontsLoaded ? (
            <LoadingScreen message="Loading fonts" />
          ) : (
            <BottomSheetModalProvider>
              <StatusBar style="auto" />
              <AuthProvider>
                <AiInsightsProvider>
                  <AuthNavigator />
                </AiInsightsProvider>
              </AuthProvider>
            </BottomSheetModalProvider>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
