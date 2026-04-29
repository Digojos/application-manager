import { listMiniApps } from "@/lib/miniapps";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const apps = await listMiniApps(false);
  return <AdminClient initialApps={apps} />;
}
