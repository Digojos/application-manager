import type { Metadata } from "next";
import { BasketballViewClient } from "./basketball-view-client";

export const metadata: Metadata = {
  title: "Visualização do placar | Application Manager",
  description: "Tela de visualização do placar de basquete em tempo real",
};

interface ViewPageProps {
  params: Promise<{ id: string }>;
}

export default async function BasketballViewPage({ params }: ViewPageProps) {
  const { id } = await params;
  return <BasketballViewClient sessionId={id} />;
}
