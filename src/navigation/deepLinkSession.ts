import { type DeepLinkSession } from '@/navigation/deepLinkResolver';

let currentSession: DeepLinkSession = { authenticated: false, role: null };
let pendingResumePath: string | null = null;

export function setDeepLinkSession(session: DeepLinkSession): void {
  currentSession = session;
}

export function getDeepLinkSession(): DeepLinkSession {
  return currentSession;
}

export function stashResumePath(path: string): void {
  pendingResumePath = path;
}

export function consumeResumePath(): string | null {
  const path = pendingResumePath;
  pendingResumePath = null;
  return path;
}
