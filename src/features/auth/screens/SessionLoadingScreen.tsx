import { Screen } from '@/components/layout/Screen';
import { LoadingScreen } from '@/components/feedback/LoadingScreen';

export function SessionLoadingScreen() {
  return (
    <Screen safeArea={false} scrollable={false}>
      <LoadingScreen message="Preparing your ScoutX session" />
    </Screen>
  );
}
