"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readSavedPreferences } from "../saved-preferences";

export function BasketballSessionsClient() {
  const router = useRouter();
  const [title, setTitle] = useState("Placar de Basquete");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const saved = readSavedPreferences();

      const response = await fetch("/api/basketball-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved ? { title, config: saved.config, display: saved.display } : { title }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Não foi possível criar a sessão");
      }

      const session = await response.json();
      setTitle("Placar de Basquete");
      router.push(`/placar-basquete?sessionId=${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a sessão");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleCreateSession} className="mt-5 flex flex-wrap gap-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Nome da sessão"
        className="min-w-64 rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500"
      />
      <button disabled={isSaving} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">
        {isSaving ? "Criando..." : "Criar sessão"}
      </button>
      {error && <p className="w-full text-sm text-rose-300">{error}</p>}
    </form>
  );
}
