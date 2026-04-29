import Link from "next/link";
import { getMiniAppByPath } from "@/lib/miniapps";

interface NotFoundPageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function NotFoundPage({ params }: NotFoundPageProps) {
  const { slug } = await params;
  const path = "/" + slug.join("/");

  // Check if this path is registered in the database (but has no real page yet)
  const registered = await getMiniAppByPath(path);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-10 max-w-lg w-full">
        <p className="text-6xl font-bold text-indigo-200 mb-4">404</p>

        {registered ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{registered.title}</h1>
            <p className="text-gray-500 mb-1">Esta aplicação está cadastrada no sistema:</p>
            <p className="font-mono text-sm text-indigo-600 mb-4">{registered.path}</p>
            <p className="text-sm text-gray-400 mb-6">{registered.description}</p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              O conteúdo desta aplicação ainda não foi implementado.
              <br />
              Entre em contato com o administrador.
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Página não encontrada</h1>
            <p className="text-gray-500 mb-2">
              O endereço <span className="font-mono text-sm text-indigo-600">{path}</span> não existe neste sistema.
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              Se você acredita que deveria existir, entre em contato com o administrador.
            </div>
          </>
        )}

        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
