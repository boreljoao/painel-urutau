/**
 * Recuperar clientes: quem parou de comprar e vale uma mensagem. Sem banco nem IA (custo zero):
 * a regra olha os dias em que a pessoa comprou e compara com o ritmo dela.
 *
 * - Cliente com 3 compras ou mais tem um ritmo (a mediana dos intervalos). Entra na lista quando
 *   já passou bem do ritmo: 1,5 vez o intervalo e pelo menos 14 dias de atraso.
 * - Cliente com 1 ou 2 compras entra quando a última passou da janela do ramo (ex.: 60 dias na loja).
 * - Fica de fora: quem pediu para não receber, quem não tem telefone, quem já tem horário marcado,
 *   quem foi chamado nos últimos 30 dias e quem sumiu há tanto tempo que a mensagem soaria estranha.
 */
import type { Perfil } from "@/db/schema";
import { diasEntre } from "@/lib/datas";

export type MotivoContato = "ritmo" | "sumiu";

export interface HistoricoCliente {
  clienteId: string;
  nome: string;
  telefone: string | null;
  /** Dias (AAAA-MM-DD) em que comprou, sem repetir. */
  dias: string[];
  gastoCentavos: number;
  naoContatar: boolean;
  /** Próximo horário marcado (hoje ou depois), se houver. */
  proximoHorario: string | null;
  /** Último contato de recuperação registrado (AAAA-MM-DD). */
  ultimoContato: string | null;
}

export interface ClienteParaChamar {
  clienteId: string;
  nome: string;
  telefone: string;
  motivo: MotivoContato;
  /** "Costumava voltar a cada 32 dias; a última vez foi há 75." */
  porque: string;
  diasDesde: number;
  ritmoDias: number | null;
  compras: number;
  gastoCentavos: number;
  ultimaCompra: string;
  prioridade: number;
}

/** Depois de quantos dias sem comprar alguém de 1–2 compras vale um contato, por ramo. */
export const JANELA_POR_RAMO: Partial<Record<Perfil, number>> = {
  consultorio: 45,
  alimentacao: 30,
  varejo: 60,
  servicos: 150,
  revenda_veiculos: 365,
};
const JANELA_PADRAO = 60;
/** Quem sumiu há mais que isso fica de fora: depois de um ano e meio a mensagem soa estranha. */
const LIMITE_DIAS = 540;
export const INTERVALO_ENTRE_CONTATOS = 30;

export function mediana(valores: number[]) {
  if (!valores.length) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function avaliarCliente(h: HistoricoCliente, hoje: string, perfil: Perfil): ClienteParaChamar | null {
  if (h.naoContatar || !h.telefone || !h.dias.length) return null;
  if (h.proximoHorario && h.proximoHorario >= hoje) return null;
  if (h.ultimoContato && diasEntre(h.ultimoContato, hoje) < INTERVALO_ENTRE_CONTATOS) return null;
  const dias = [...new Set(h.dias)].sort();
  const ultima = dias.at(-1)!;
  const desde = diasEntre(ultima, hoje);
  if (desde > LIMITE_DIAS || desde < 1) return null;
  const ticket = h.gastoCentavos / dias.length;
  // Quem sumiu há pouco tem mais chance de voltar: o peso cai com o tempo.
  const frescor = 1 / (1 + desde / 180);

  if (dias.length >= 3) {
    const intervalos = dias.slice(1).map((d, i) => diasEntre(dias[i], d));
    const ritmo = Math.max(1, mediana(intervalos));
    if (desde < Math.max(ritmo * 1.5, ritmo + 14)) return null;
    return {
      clienteId: h.clienteId,
      nome: h.nome,
      telefone: h.telefone,
      motivo: "ritmo",
      porque: `Costumava voltar a cada ${plural(ritmo, "dia", "dias")}; a última vez foi há ${plural(desde, "dia", "dias")}.`,
      diasDesde: desde,
      ritmoDias: ritmo,
      compras: dias.length,
      gastoCentavos: h.gastoCentavos,
      ultimaCompra: ultima,
      // Cliente frequente que parou vale mais que um que comprou uma vez.
      prioridade: Math.round(ticket * Math.min(dias.length, 12) * frescor),
    };
  }
  const janela = JANELA_POR_RAMO[perfil] ?? JANELA_PADRAO;
  if (desde < janela) return null;
  return {
    clienteId: h.clienteId,
    nome: h.nome,
    telefone: h.telefone,
    motivo: "sumiu",
    porque: `Comprou ${dias.length === 1 ? "uma vez" : "duas vezes"}; a última há ${plural(desde, "dia", "dias")}.`,
    diasDesde: desde,
    ritmoDias: null,
    compras: dias.length,
    gastoCentavos: h.gastoCentavos,
    ultimaCompra: ultima,
    prioridade: Math.round(ticket * dias.length * frescor),
  };
}

export function clientesParaChamar(historicos: HistoricoCliente[], hoje: string, perfil: Perfil, limite = 30) {
  return historicos
    .map((h) => avaliarCliente(h, hoje, perfil))
    .filter((c): c is ClienteParaChamar => !!c)
    .sort((a, b) => b.prioridade - a.prioridade || a.diasDesde - b.diasDesde)
    .slice(0, limite);
}

// ─── Mensagem sugerida ───────────────────────────────────────────────────────

const CONVITE: Partial<Record<Perfil, string>> = {
  consultorio: "Faz um tempo desde a nossa última sessão. Quer que eu veja um horário para você nesta semana?",
  alimentacao: "Faz um tempinho que você não pede com a gente. Quer que eu separe algo para você nesta semana?",
  varejo: "Faz um tempinho que você não passa aqui, e chegaram novidades que combinam com o que você levou. Quer que eu mande umas fotos?",
  servicos: "Já faz um tempo desde o último serviço. Quer agendar uma revisão para evitar problema mais para frente?",
  revenda_veiculos: "Como está o carro? Se pensar em trocar, entraram opções novas no pátio. Posso te mandar algumas?",
};
const CONVITE_PADRAO = "Faz um tempinho que a gente não se fala. Posso te ajudar com alguma coisa nesta semana?";
export const RODAPE_SAIR = "Se preferir não receber mensagens nossas, é só responder SAIR.";

export const primeiroNome = (nome: string) => {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : "";
};

/** A sugestão que a equipe revisa antes de mandar. Sempre com o jeito de pedir para parar. */
export function mensagemSugerida(o: { nome: string; empresa: string; perfil: Perfil; remetente?: string | null }) {
  const nome = primeiroNome(o.nome);
  const quem = o.remetente ? `Aqui é ${primeiroNome(o.remetente)}, da ${o.empresa}.` : `Aqui é da ${o.empresa}.`;
  return `Oi${nome ? `, ${nome}` : ""}! ${quem} ${CONVITE[o.perfil] ?? CONVITE_PADRAO}\n\n${RODAPE_SAIR}`;
}

/** Link do WhatsApp com a mensagem pronta (a pessoa ainda confere e toca em Enviar). */
export const linkWhatsapp = (telefone: string, mensagem: string) => `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;

// ─── Resultado ───────────────────────────────────────────────────────────────

export const NOME_RESULTADO = {
  enviado: "Aguardando resposta",
  respondeu: "Respondeu",
  agendou: "Agendou",
  comprou: "Comprou",
  sem_interesse: "Sem interesse",
} as const;
