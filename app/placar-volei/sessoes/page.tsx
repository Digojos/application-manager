import { listScoreboardSessions, type PublicScoreboardSessionRecord } from "@/lib/scoreboard-sessions";
import Link from "next/link";
import { ScoreboardSessionsClient } from "./scoreboard-sessions-client";
import { SessionActionsClient } from "./session-actions-client";

export default async function ScoreboardSessionsPage() {
  const sessions: PublicScoreboardSessionRecord[] = await listScoreboardSessions();

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Sessões do placar</p>
          <h1 className="mt-2 text-3xl font-bold">Controle e visualização</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Esta é a base para usar uma sessão compartilhada entre um controle e várias telas de exibição.
            A criação e atualização real-time virão na próxima etapa.
          </p>
          <div className="mt-4">
            <Link
              href="/placar-volei/tv"
              className="inline-flex items-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/20"
            >
              Abrir lista simplificada para TV
            </Link>
          </div>
          <ScoreboardSessionsClient />
        </section>

        <section className="grid gap-4">
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
              Nenhuma sessão criada ainda.
            </div>
          ) : (
            sessions.map((session) => (
              <article key={session.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{session.title}</h2>
                    <p className="mt-1 text-sm text-slate-400">ID: {session.id}</p>
                  </div>
                  <SessionActionsClient sessionId={session.id} />
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  Criada em {session.createdAt.toLocaleString("pt-BR")} · Atualizada em {session.updatedAt.toLocaleString("pt-BR")}
                </p>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
