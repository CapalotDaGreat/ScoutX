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

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return <LoadingScreen message="Loading fonts" />;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <ThemeProvider>
          <BottomSheetModalProvider>
            <StatusBar style="auto" />
            <AuthProvider>
              <AuthNavigator />
            </AuthProvider>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
