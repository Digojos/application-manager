import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Placar de Vôlei | Application Manager",
  description: "Placar interativo para partidas de vôlei",
};

export default function PlacarVoleiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
