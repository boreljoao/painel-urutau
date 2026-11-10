import type { ArquivoPostInstagram, FormatoPostInstagram, SituacaoPostInstagram } from "@/db/schema";

/** Como cada situação aparece no calendário, na lista e na atividade ao vivo. */
export const ETIQUETA: Record<SituacaoPostInstagram, { nome: string; tom: string }> = {
  rascunho: { nome: "Rascunho", tom: "cinza" },
  criando: { nome: "Gerando", tom: "roxo" },
  analisando: { nome: "Gerando", tom: "roxo" },
  pronto: { nome: "Gerado", tom: "roxo" },
  enviando: { nome: "Publicando", tom: "laranja" },
  enviado: { nome: "Publicando", tom: "laranja" },
  agendado: { nome: "Agendado", tom: "azul" },
  publicado: { nome: "Publicado", tom: "verde" },
  erro: { nome: "Erro", tom: "vermelho" },
};

export const LEGENDA_CALENDARIO = [
  { nome: "Agendado", tom: "azul" },
  { nome: "Publicando", tom: "laranja" },
  { nome: "Publicado", tom: "verde" },
  { nome: "Gerado", tom: "roxo" },
];

export const NOME_FORMATO: Record<FormatoPostInstagram, string> = { post: "Post", carrossel: "Carrossel", reel: "Reel", story: "Story" };

export const FUSO = "America/Sao_Paulo";

/** "2026-11-10" no fuso de Brasília. */
export const diaDe = (d: Date | string) => new Intl.DateTimeFormat("sv-SE", { timeZone: FUSO }).format(new Date(d));
export const horaDe = (d: Date | string) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
export const dataCurta = (d: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

/** Valor para <input type="datetime-local"> no horário de Brasília. */
export function paraCampoData(d: Date | string | null) {
  if (!d) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(d))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** O que o campo datetime-local devolve, lido como horário de Brasília (UTC−3, sem horário de verão). */
export const doCampoData = (v: string) => (v ? `${v}:00-03:00` : "");

export interface PostNaTela {
  id: string;
  tema: string;
  formato: FormatoPostInstagram;
  situacao: SituacaoPostInstagram;
  arquivos: ArquivoPostInstagram[];
  agendadoPara: string | null;
  publicadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  conteudo: { arte: { titulo: string } } | null;
}

/** A data em que o post aparece no calendário. */
export const dataNoCalendario = (p: Pick<PostNaTela, "publicadoEm" | "agendadoPara" | "criadoEm">) => p.publicadoEm ?? p.agendadoPara ?? p.criadoEm;

/** Miniatura: a primeira foto enviada ou a arte gerada. */
export function miniatura(p: Pick<PostNaTela, "id" | "arquivos" | "conteudo">) {
  const foto = p.arquivos.find((a) => a.tipo === "imagem");
  if (foto) return foto.url;
  return p.conteudo ? `/arte/${p.id}.png` : null;
}

export const tituloDo = (p: Pick<PostNaTela, "tema" | "conteudo">) => p.conteudo?.arte.titulo || p.tema;

export const numero = (n: number) => (n >= 10_000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : n.toLocaleString("pt-BR"));
