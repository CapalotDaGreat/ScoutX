import type { ReactElement } from 'react';
import Constants from 'expo-constants';

type AgentationProbeComponent = () => ReactElement | null;

const isExpoGo = Constants.executionEnvironment === 'storeClient';

function loadAgentationProbe(): AgentationProbeComponent {
  try {
    return require('@re-agentation/probe').AgentationProbe as AgentationProbeComponent;
  } catch {
    return () => null;
  }
}

/**
 * Re-agentation in-app probe — dev only, not in Expo Go.
 */
export const AgentationDevProbe: AgentationProbeComponent =
  __DEV__ && !isExpoGo ? loadAgentationProbe() : () => null;
