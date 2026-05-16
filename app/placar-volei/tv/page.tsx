import { listActiveScoreboardSessions } from "@/lib/scoreboard-sessions";
import { TvSessionsClient, type TvSessionItem } from "./tv-sessions-client";

export const metadata = {
  title: "TV | Sessões ativas",
  description: "Lista de sessões em andamento para abrir na televisão",
};

export const dynamic = "force-dynamic";

export default async function TvPage() {
  const sessions = await listActiveScoreboardSessions();

  const initialSessions: TvSessionItem[] = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt.toISOString(),
    viewPath: `/placar-volei/view/${session.id}`,
  }));

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-8 text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        

        <TvSessionsClient initialSessions={initialSessions} />
      </main>
    </div>
  );
}
