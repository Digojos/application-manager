import type { ScoreboardSessionRecord } from "@/lib/scoreboard-sessions";

type SessionListener = (session: ScoreboardSessionRecord) => void;

const scoreboardStreams = globalThis as typeof globalThis & {
  __scoreboardSessionListeners?: Map<string, Set<SessionListener>>;
};

function getListenerMap() {
  if (!scoreboardStreams.__scoreboardSessionListeners) {
    scoreboardStreams.__scoreboardSessionListeners = new Map();
  }

  return scoreboardStreams.__scoreboardSessionListeners;
}

export function subscribeToScoreboardSession(sessionId: string, listener: SessionListener) {
  const listeners = getListenerMap();
  const sessionListeners = listeners.get(sessionId) ?? new Set<SessionListener>();

  sessionListeners.add(listener);
  listeners.set(sessionId, sessionListeners);

  return () => {
    const currentListeners = listeners.get(sessionId);
    if (!currentListeners) return;

    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      listeners.delete(sessionId);
    }
  };
}

export function publishScoreboardSessionUpdate(session: ScoreboardSessionRecord) {
  const listeners = getListenerMap().get(session.id);
  if (!listeners) return;

  for (const listener of listeners) {
    listener(session);
  }
}