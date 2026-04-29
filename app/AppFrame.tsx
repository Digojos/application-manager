"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ISOLATED_ROUTE_PREFIXES = ["C"];

function isIsolatedRoute(pathname: string) {
  return ISOLATED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isolated = isIsolatedRoute(pathname);

  if (isolated) {
    return <main className="w-full min-h-full">{children}</main>;
  }

  return (
    <>
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">
            Application Manager
          </Link>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-indigo-600 transition-colors font-medium">
            Painel Admin
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8 w-full flex-1">{children}</main>
    </>
  );
}