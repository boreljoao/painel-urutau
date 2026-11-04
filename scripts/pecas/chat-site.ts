/**
 * Só os tipos que o schema do banco importa. O arquivo de verdade (com os textos e as regras do
 * chat do site da Urutau) fica no app-urutau e não é copiado para cá: este repositório é público.
 */
export const URGENCIAS = ["agora", "este_mes", "pesquisando"] as const;
export const TEMPERATURAS = ["quente", "morno", "frio"] as const;
export type Urgencia = (typeof URGENCIAS)[number];
export type Temperatura = (typeof TEMPERATURAS)[number];

/** O que o agente anota do visitante durante a conversa. */
export interface FichaVisitante {
  objetivo?: string;
  negocio?: string;
  usaHoje?: string;
  duvidas?: string[];
  urgencia?: Urgencia;
  orcamento?: string;
  temperatura?: Temperatura;
  proximoPasso?: string;
}
