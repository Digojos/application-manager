import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
        <p className="text-sm text-gray-500">
          Logado como <span className="font-medium text-gray-700">{session.user?.name}</span>
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Sair
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
