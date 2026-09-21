import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    const updateStatus = (state: Network.NetworkState) => {
      if (!mounted) {
        return;
      }

      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    };

    void Network.getNetworkStateAsync().then(updateStatus).catch(() => undefined);
    const subscription = Network.addNetworkStateListener(updateStatus);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return { isOffline };
}