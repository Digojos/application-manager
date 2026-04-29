"use client";

import { useState } from "react";
import { MiniAppForm } from "./MiniAppForm";

interface MiniApp {
  id: number;
  title: string;
  path: string;
  description: string;
  active: boolean;
}

interface AdminClientProps {
  initialApps: MiniApp[];
}

export default function AdminClient({ initialApps }: AdminClientProps) {
  const [apps, setApps] = useState<MiniApp[]>(initialApps);
  const [showForm, setShowForm] = useState(false);
  const [editingApp, setEditingApp] = useState<MiniApp | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  }

  function handleCreated(app: MiniApp) {
    setApps((prev) => [...prev, app].sort((a, b) => a.title.localeCompare(b.title)));
    setShowForm(false);
    showFeedback("success", `Aplicação "${app.title}" criada com sucesso!`);
  }

  function handleUpdated(app: MiniApp) {
    setApps((prev) => prev.map((a) => (a.id === app.id ? app : a)));
    setEditingApp(null);
    showFeedback("success", `Aplicação "${app.title}" atualizada com sucesso!`);
  }

  async function handleDelete(app: MiniApp) {
    if (!window.confirm(`Excluir a aplicação "${app.title}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(app.id);
    try {
      const res = await fetch(`/api/admin/miniapps/${app.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        showFeedback("error", json.error ?? "Erro ao excluir");
        return;
      }
      setApps((prev) => prev.filter((a) => a.id !== app.id));
      showFeedback("success", `Aplicação "${app.title}" excluída.`);
    } catch {
      showFeedback("error", "Erro de conexão ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Painel Admin</h1>
          <p className="mt-1 text-gray-500">Gerencie as aplicações disponíveis no sistema.</p>
        </div>
        {!showForm && !editingApp && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            + Nova aplicação
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-600"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {(showForm || editingApp) && (
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingApp ? `Editar: ${editingApp.title}` : "Nova aplicação"}
          </h2>
          <MiniAppForm
            defaultValues={editingApp ?? undefined}
            isEditing={!!editingApp}
            onSuccess={editingApp ? handleUpdated : handleCreated}
            onCancel={() => {
              setShowForm(false);
              setEditingApp(null);
            }}
          />
        </div>
      )}

      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-400">Nenhuma aplicação cadastrada.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-6 py-3 font-semibold text-gray-600">Título</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Path</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-6 py-3 font-semibold text-gray-600 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{app.title}</td>
                  <td className="px-6 py-4 font-mono text-gray-500">{app.path}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        app.active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {app.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingApp(app);
                          setShowForm(false);
                        }}
                        className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(app)}
                        disabled={deletingId === app.id}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === app.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
