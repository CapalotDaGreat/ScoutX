import { useEffect, useState, type ReactNode } from 'react';
import { LoadingScreen } from '@/components';
import { ensureFirebaseInitialized } from '@/config/firebase';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type FirebaseBootstrapProps = {
  children: ReactNode;
};

export function FirebaseBootstrap({ children }: FirebaseBootstrapProps) {
  const { t } = useAppTranslation('common');
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        await ensureFirebaseInitialized();
        if (!cancelled) {
          setError(null);
          setIsReady(true);
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(
            bootstrapError instanceof Error
              ? bootstrapError.message
              : t('firebaseBootstrapFailed'),
          );
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [t]);

  if (error) {
    return <LoadingScreen message={error} />;
  }

  if (!isReady) {
    return <LoadingScreen message={t('initializingServices')} />;
  }

  return children;
}
