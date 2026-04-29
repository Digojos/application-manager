import Link from "next/link";
import { listMiniApps } from "@/lib/miniapps";

export const dynamic = "force-dynamic";

export default async function Home() {
  const apps = await listMiniApps(true);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Miniaplicações</h1>
        <p className="mt-2 text-gray-500">Selecione uma aplicação abaixo para começar.</p>
      </div>

      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-400 text-lg">Nenhuma aplicação cadastrada ainda.</p>
          <Link
            href="/admin"
            className="mt-4 inline-block text-indigo-600 hover:underline font-medium"
          >
            Cadastrar no painel admin →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={app.path}
              className="group block rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-indigo-400 transition-all"
            >
              <h2 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                {app.title}
              </h2>
              <p className="mt-2 text-sm text-gray-500 line-clamp-3">{app.description}</p>
              <span className="mt-4 inline-block text-xs font-mono text-gray-400">{app.path}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

