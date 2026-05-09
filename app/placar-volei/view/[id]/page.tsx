import type { Metadata } from "next";
import { ViewSessionClient } from "./view-session-client";

export const metadata: Metadata = {
  title: "Visualização do placar | Application Manager",
  description: "Tela de visualização do placar de vôlei em tempo real",
};

interface ViewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ScoreboardViewPage({ params }: ViewPageProps) {
  const { id } = await params;
  return <ViewSessionClient sessionId={id} />;
}
