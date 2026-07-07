import type { ReactElement } from 'react';

type AgentationProbeComponent = () => ReactElement | null;

/**
 * Re-agentation in-app probe — dev only.
 * @see https://github.com/Re-agentation/re-agentation
 *
 * Tap the floating probe in the simulator, select a component, describe a change,
 * and route it to your AI agent via Metro + MCP.
 */
export const AgentationDevProbe: AgentationProbeComponent = __DEV__
  ? require('@re-agentation/probe').AgentationProbe
  : () => null;
