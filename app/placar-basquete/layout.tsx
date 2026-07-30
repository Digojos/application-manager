import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Placar de Basquete | Application Manager",
  description: "Placar interativo para partidas de basquete, com cronômetro de jogo e posse de 24s",
};

export default function PlacarBasqueteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
