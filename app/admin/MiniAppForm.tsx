"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { miniAppSchema, type MiniAppInput } from "@/lib/validations";

interface MiniApp {
  id: number;
  title: string;
  path: string;
  description: string;
  active: boolean;
}

interface MiniAppFormProps {
  defaultValues?: Partial<MiniApp>;
  onSuccess: (app: MiniApp) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export function MiniAppForm({ defaultValues, onSuccess, onCancel, isEditing = false }: MiniAppFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MiniAppInput>({
    resolver: zodResolver(miniAppSchema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      path: defaultValues?.path ?? "",
      description: defaultValues?.description ?? "",
      active: defaultValues?.active ?? true,
    },
  });

  async function onSubmit(data: MiniAppInput) {
    setServerError(null);
    try {
      const url = isEditing
        ? `/api/admin/miniapps/${defaultValues!.id}`
        : "/api/admin/miniapps";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Erro ao salvar");
        return;
      }
      onSuccess(json);
    } catch {
      setServerError("Erro de conexão");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
        <input
          {...register("title")}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Ex: Placar de Vôlei"
        />
        {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Path</label>
        <input
          {...register("path")}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Ex: /placar-volei"
          disabled={isEditing}
        />
        {errors.path && <p className="mt-1 text-xs text-red-500">{errors.path.message}</p>}
        {isEditing && <p className="mt-1 text-xs text-gray-400">O path não pode ser alterado após criação.</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
        <textarea
          {...register("description")}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          placeholder="Descreva o que essa aplicação faz..."
        />
        {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          {...register("active")}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="active" className="text-sm font-medium text-gray-700">
          Ativa (visível na lista principal)
        </label>
      </div>

      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {isSubmitting ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar aplicação"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
