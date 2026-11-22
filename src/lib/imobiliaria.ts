/**
 * Regras da imobiliária que não dependem de banco: nomes, comissão, taxa de administração e
 * repasse, vencimento e reajuste do aluguel, situação do mês e a ficha do imóvel para o WhatsApp.
 */
import type { EtapaNegocio, FinalidadeImovel, StatusImovel } from "@/db/schema";
import { type Data, diasEntre, somarMeses } from "@/lib/datas";
import { aplicarPcm, formatarReais } from "@/lib/dinheiro";

export const ETAPAS: EtapaNegocio[] = ["lead", "atendimento", "visita", "proposta", "fechado", "perdido"];
export const ETAPAS_ABERTAS: EtapaNegocio[] = ["lead", "atendimento", "visita", "proposta"];

export const NOME_ETAPA: Record<EtapaNegocio, string> = {
  lead: "Novo contato",
  atendimento: "Em atendimento",
  visita: "Visita",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
};

export const NOME_STATUS_IMOVEL: Record<StatusImovel, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  alugado: "Alugado",
  vendido: "Vendido",
  suspenso: "Suspenso",
};

export const NOME_FINALIDADE: Record<FinalidadeImovel, string> = {
  venda: "Venda",
  aluguel: "Aluguel",
  venda_aluguel: "Venda e aluguel",
};

export const TIPOS_IMOVEL = ["apartamento", "casa", "casa_condominio", "cobertura", "terreno", "sala", "loja", "galpao", "chacara"] as const;
export type TipoImovel = (typeof TIPOS_IMOVEL)[number];
export const NOME_TIPO: Record<string, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  casa_condominio: "Casa em condomínio",
  cobertura: "Cobertura",
  terreno: "Terreno",
  sala: "Sala comercial",
  loja: "Loja",
  galpao: "Galpão",
  chacara: "Chácara",
};
export const nomeTipo = (t: string) => NOME_TIPO[t] ?? t;

export const ORIGENS_LEAD = ["Portal", "Site", "Instagram", "WhatsApp", "Indicação", "Placa", "Passou na loja"];
export const MOTIVOS_PERDA = ["Comprou com outra imobiliária", "Desistiu", "Fora do orçamento", "Não conseguiu crédito", "Sem resposta"];
export const INDICES = ["IGP-M", "IPCA", "IVAR"];
export const GARANTIAS = ["Caução", "Fiador", "Seguro-fiança", "Título de capitalização", "Sem garantia"];

/** Comissão do corretor/imobiliária sobre o valor do negócio. */
export const comissao = (valorCentavos: number, pcm: number) => aplicarPcm(valorCentavos, pcm);

/** O mês do aluguel: a taxa da imobiliária e o que vai para o proprietário. */
export function divisaoAluguel(aluguelCentavos: number, taxaAdmPcm: number) {
  const taxa = aplicarPcm(aluguelCentavos, taxaAdmPcm);
  return { taxa, repasse: aluguelCentavos - taxa };
}

/** Dia de vencimento dentro do mês (AAAA-MM). */
export const vencimentoDoMes = (competencia: string, dia: number): Data => `${competencia}-${String(Math.min(Math.max(dia, 1), 28)).padStart(2, "0")}`;

export type SituacaoAluguel = "a_vencer" | "vence_hoje" | "atrasado" | "repassar" | "repassado";

export const NOME_SITUACAO_ALUGUEL: Record<SituacaoAluguel, string> = {
  a_vencer: "A vencer",
  vence_hoje: "Vence hoje",
  atrasado: "Atrasado",
  repassar: "Recebido · repassar",
  repassado: "Repassado",
};

export function situacaoAluguel(a: { recebidoEm: Data | null; repassadoEm: Data | null }, vencimento: Data, hoje: Data): SituacaoAluguel {
  if (a.repassadoEm) return "repassado";
  if (a.recebidoEm) return "repassar";
  if (vencimento === hoje) return "vence_hoje";
  return vencimento < hoje ? "atrasado" : "a_vencer";
}

/** Próximo aniversário do contrato (reajuste anual) a partir de hoje, ou null se o contrato acaba antes. */
export function proximoReajuste(inicio: Data, fim: Data, hoje: Data): Data | null {
  for (let anos = 1; anos <= 30; anos++) {
    const d = `${somarMeses(inicio.slice(0, 7), 12 * anos)}${inicio.slice(7)}`;
    if (d >= hoje) return d < fim ? d : null;
  }
  return null;
}

/** Contrato vence em até `dias`? (para renovar ou anunciar o imóvel de novo) */
export const venceEm = (fim: Data, hoje: Data) => diasEntre(hoje, fim);

/** Preço do metro quadrado, em centavos (null sem área ou preço). */
export const precoM2 = (preco: number | null, area: number | null) => (preco && area ? Math.round(preco / area) : null);

/** O valor que aparece no card: venda, aluguel ou os dois. */
export function valorAnunciado(i: { finalidade: FinalidadeImovel; precoVendaCentavos: number | null; aluguelCentavos: number | null }) {
  const venda = i.precoVendaCentavos ? formatarReais(i.precoVendaCentavos).replace(/,00$/, "") : null;
  const aluguel = i.aluguelCentavos ? `${formatarReais(i.aluguelCentavos).replace(/,00$/, "")}/mês` : null;
  if (i.finalidade === "venda") return venda ?? "Consulte";
  if (i.finalidade === "aluguel") return aluguel ?? "Consulte";
  return [venda, aluguel].filter(Boolean).join(" · ") || "Consulte";
}

interface DadosFicha {
  codigo: string;
  titulo: string;
  tipo: string;
  finalidade: FinalidadeImovel;
  bairro: string;
  cidade: string;
  areaM2: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  precoVendaCentavos: number | null;
  aluguelCentavos: number | null;
  condominioCentavos: number | null;
  iptuCentavos: number | null;
  destaques: string[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Texto curto do imóvel para mandar ao cliente pelo WhatsApp (sem endereço exato: só bairro). */
export function fichaWhatsapp(i: DadosFicha, empresa: string) {
  const linhas = [
    `*${i.titulo}*`,
    `${nomeTipo(i.tipo)} · ${[i.bairro, i.cidade].filter(Boolean).join(", ")}`,
    "",
    [
      i.areaM2 ? `${i.areaM2} m²` : null,
      i.quartos ? plural(i.quartos, "quarto", "quartos") + (i.suites ? ` (${plural(i.suites, "suíte", "suítes")})` : "") : null,
      i.banheiros ? plural(i.banheiros, "banheiro", "banheiros") : null,
      i.vagas ? plural(i.vagas, "vaga", "vagas") : null,
    ]
      .filter(Boolean)
      .join(" · "),
    i.destaques.length ? `✓ ${i.destaques.slice(0, 5).join("\n✓ ")}` : null,
    "",
    i.finalidade !== "aluguel" && i.precoVendaCentavos ? `Venda: ${formatarReais(i.precoVendaCentavos)}` : null,
    i.finalidade !== "venda" && i.aluguelCentavos ? `Aluguel: ${formatarReais(i.aluguelCentavos)}/mês` : null,
    i.condominioCentavos ? `Condomínio: ${formatarReais(i.condominioCentavos)}` : null,
    i.iptuCentavos ? `IPTU: ${formatarReais(i.iptuCentavos)}/ano` : null,
    "",
    `Ref. ${i.codigo} · ${empresa}`,
    "Quer marcar uma visita?",
  ];
  // Sem linha vazia repetida (campos que não vieram somem junto com o espaço).
  const saida: string[] = [];
  for (const l of linhas) {
    if (l === null || (l === "" && (!saida.length || saida.at(-1) === ""))) continue;
    saida.push(l);
  }
  return saida.join("\n").trim();
}

/** Próximo código livre no padrão do tipo: AP-0001, CA-0001… */
export function proximoCodigo(tipo: string, existentes: string[]) {
  const prefixo = ({ apartamento: "AP", casa: "CA", casa_condominio: "CC", cobertura: "CO", terreno: "TE", sala: "SA", loja: "LO", galpao: "GA", chacara: "CH" } as Record<string, string>)[tipo] ?? "IM";
  const maior = existentes.reduce((m, c) => {
    const r = new RegExp(`^${prefixo}-(\\d+)$`).exec(c);
    return r ? Math.max(m, Number(r[1])) : m;
  }, 0);
  return `${prefixo}-${String(maior + 1).padStart(4, "0")}`;
}
