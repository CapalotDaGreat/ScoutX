import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

function urlHasEndorseParam(url: string | null | undefined): boolean {
  return url?.includes('endorse=1') ?? false;
}

export function useEndorseModeFromLinking(): boolean {
  const [endorseMode, setEndorseMode] = useState(false);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => setEndorseMode(urlHasEndorseParam(url)));
    const subscription = Linking.addEventListener('url', ({ url }) => {
      setEndorseMode(urlHasEndorseParam(url));
    });
    return () => subscription.remove();
  }, []);

  return endorseMode;
}
