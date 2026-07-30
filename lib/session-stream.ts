type SessionListener<T> = (session: T) => void;

/**
 * Fábrica de um canal pub/sub em memória para atualizações de sessão (SSE).
 * Guardado em `globalThis` sob `globalKey` para sobreviver ao HMR do Next em dev
 * (mesmo truque de `lib/prisma.ts`). Funciona apenas dentro de um único processo —
 * não há adapter (Redis, etc.), então múltiplas instâncias do app não compartilham
 * as notificações entre si.
 */
export function createSessionChannel<T extends { id: string }>(globalKey: string) {
  const registry = globalThis as typeof globalThis & {
    [key: string]: Map<string, Set<SessionListener<T>>> | undefined;
  };

  function getListenerMap(): Map<string, Set<SessionListener<T>>> {
    if (!registry[globalKey]) {
      registry[globalKey] = new Map<string, Set<SessionListener<T>>>();
    }

    return registry[globalKey] as Map<string, Set<SessionListener<T>>>;
  }

  function subscribe(sessionId: string, listener: SessionListener<T>) {
    const listeners = getListenerMap();
    const sessionListeners = listeners.get(sessionId) ?? new Set<SessionListener<T>>();

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

  function publish(session: T) {
    const listeners = getListenerMap().get(session.id);
    if (!listeners) return;

    for (const listener of listeners) {
      listener(session);
    }
  }

  return { subscribe, publish };
}
