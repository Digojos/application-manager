import { redirect } from "next/navigation";

export default function UndefinedPage() {
  redirect("/login");
  return null;
}
