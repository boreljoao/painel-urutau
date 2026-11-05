import type { Perfil } from "@/db/schema";

/**
 * A cor de cada painel. Por enquanto sai do tipo de negócio; quando a empresa tiver a própria
 * cor cadastrada, ela entra aqui. Cor: dados e o que está selecionado. Clara: fundo do selecionado.
 */
const CORES: Record<Perfil, { cor: string; clara: string }> = {
  revenda_veiculos: { cor: "#0a6b45", clara: "#e3f1ea" },
  varejo: { cor: "#22325a", clara: "#e4e8f2" },
  consultorio: { cor: "#2e5e57", clara: "#e1ece9" },
  servicos: { cor: "#7a4b1f", clara: "#f3e9df" },
  alimentacao: { cor: "#9a3b1b", clara: "#f6e5de" },
  contabilidade: { cor: "#3d3a8c", clara: "#e8e7f6" },
  financas: { cor: "#141b34", clara: "#e5e7ef" },
};

export const corDoPerfil = (perfil: Perfil) => CORES[perfil] ?? CORES.financas;
