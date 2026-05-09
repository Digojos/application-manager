"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SessionActionsClientProps {
  sessionId: string;
}

export function SessionActionsClient({ sessionId }: SessionActionsClientProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm("Tem certeza que deseja excluir esta sessão?");
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/scoreboard-sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Não foi possível excluir a sessão");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir a sessão");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/placar-volei/view/${sessionId}`}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white"
        >
          Abrir tela
        </Link>
        <Link
          href={`/placar-volei?sessionId=${sessionId}`}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-slate-950"
        >
          Abrir controle
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-lg border border-rose-400/50 bg-rose-500/20 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/35 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? "Excluindo..." : "Excluir"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
