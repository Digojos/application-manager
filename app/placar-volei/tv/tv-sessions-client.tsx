"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export type TvSessionItem = {
  id: string;
  title: string;
  updatedAt: string;
  viewPath: string;
};

interface TvSessionsClientProps {
  initialSessions: TvSessionItem[];
}

const REFRESH_INTERVAL_MS = 10_000;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function TvSessionsClient({ initialSessions }: TvSessionsClientProps) {
  const [sessions, setSessions] = useState<TvSessionItem[]>(initialSessions);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/scoreboard-sessions/active", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Falha ao atualizar sessões");
      }

      const nextSessions = (await response.json()) as TvSessionItem[];
      setSessions(nextSessions);
      setRefreshError(null);
    } catch {
      setRefreshError("Não foi possível atualizar automaticamente. Use Atualizar para tentar novamente.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSessions();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSessions]);

  const sessionCountLabel = useMemo(() => {
    if (sessions.length === 1) return "1 sessão ativa";
    return `${sessions.length} sessões ativas`;
  }, [sessions.length]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-slate-300">{sessionCountLabel}</p>
        <button
          type="button"
          onClick={() => void refreshSessions()}
          className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
          disabled={isRefreshing}
        >
          {isRefreshing ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {refreshError && (
        <p className="rounded-xl border border-amber-300/40 bg-amber-400/10 p-3 text-sm text-amber-100">{refreshError}</p>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-slate-200">
          Nenhuma sessão em andamento agora.
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <article key={session.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">{session.title}</h2>
                  <p className="mt-1 text-sm text-slate-300">Atualizada em {formatTimestamp(session.updatedAt)}</p>
                </div>
                <Link
                  href={session.viewPath}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                >
                  Abrir visualização
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
