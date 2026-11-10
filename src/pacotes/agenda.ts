import type { StatusAgendamento } from "@/db/schema";
import { type Data, diaDaSemana, somarDias } from "@/lib/datas";

/**
 * As contas da agenda, sem banco: semana, horários livres, choque de horário e a mensagem de
 * confirmação. Horas são "HH:MM" de Brasília; as contas usam minutos desde a meia-noite.
 */

export interface ConfigAgenda {
  /** Começo e fim do expediente, em horas cheias. */
  inicio: number;
  fim: number;
  /** Duração padrão de um horário, em minutos. */
  duracao: number;
  /** Como o ramo chama quem vem e o que acontece. */
  pessoa: string;
  atendimento: string;
  /** Sugestões para o campo "o que vai acontecer". */
  servicos: string[];
  /** Como o campo "o que vai acontecer" se chama (Procedimento, Tipo de sessão…). */
  rotuloServico?: string;
}

export const AGENDA_PADRAO: ConfigAgenda = { inicio: 8, fim: 19, duracao: 60, pessoa: "Cliente", atendimento: "Horário", servicos: [] };

export interface ItemAgenda {
  id: string;
  data: Data;
  hora: string;
  duracaoMin: number;
  status: StatusAgendamento;
  profissional: string;
  sala: string;
}

export const NOME_STATUS: Record<StatusAgendamento, string> = {
  marcado: "Marcado",
  confirmado: "Confirmado",
  atendido: "Atendido",
  faltou: "Faltou",
  cancelado: "Cancelado",
  bloqueado: "Bloqueado",
};

/** Cancelado não ocupa o horário. */
export const ocupa = (s: StatusAgendamento) => s !== "cancelado";

export const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

export const horaDe = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const horaValida = (h: string | undefined | null): h is string => !!h && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(h);

/** A segunda-feira da semana da data. */
export function segundaDe(data: Data): Data {
  const d = diaDaSemana(data);
  return somarDias(data, d === 0 ? -6 : 1 - d);
}

export const diasDaSemana = (segunda: Data) => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));

const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const nomeDoDia = (data: Data, curto = false) => {
  const n = NOMES_DIA[diaDaSemana(data)];
  return curto ? n.slice(0, 3) : n;
};

/** Hora de Brasília agora, em minutos. */
export function agoraEmMinutos(agora = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);
  return minutos(p);
}

/** Dois horários se cruzam? (fim de um igual ao começo do outro não é choque.) */
export function cruzam(a: { hora: string; duracaoMin: number }, b: { hora: string; duracaoMin: number }) {
  const ia = minutos(a.hora);
  const ib = minutos(b.hora);
  return ia < ib + b.duracaoMin && ib < ia + a.duracaoMin;
}

/**
 * Os horários que batem com um novo. Com quem atende e sala informados, só choca com o mesmo
 * profissional ou a mesma sala (uma clínica com duas salas atende dois ao mesmo tempo); sem
 * nenhum dos dois, qualquer horário cruzado é choque.
 */
export function choques<T extends ItemAgenda>(novo: Omit<ItemAgenda, "id" | "status"> & { id?: string }, dia: T[]): T[] {
  return dia.filter((a) => {
    if (a.id === novo.id || !ocupa(a.status) || a.data !== novo.data || !cruzam(novo, a)) return false;
    if (!novo.profissional && !novo.sala) return true;
    const mesmoProfissional = !!novo.profissional && !!a.profissional && a.profissional.toLowerCase() === novo.profissional.toLowerCase();
    const mesmaSala = !!novo.sala && !!a.sala && a.sala.toLowerCase() === novo.sala.toLowerCase();
    return mesmoProfissional || mesmaSala || (!a.profissional && !a.sala);
  });
}

/**
 * Os horários livres do dia, de `duracao` em `duracao` minutos dentro do expediente. Quando um
 * horário bate com algo marcado, o próximo começa logo que aquilo termina (sessão às 9h de 50 min
 * deixa livre às 9h50). No dia de hoje, só os que ainda não passaram.
 */
export function horariosLivres(dia: ItemAgenda[], cfg: ConfigAgenda, desde = 0): string[] {
  const ocupados = dia.filter((a) => ocupa(a.status));
  const livres: string[] = [];
  let m = cfg.inicio * 60;
  while (m + cfg.duracao <= cfg.fim * 60) {
    const bate = ocupados.filter((a) => cruzam({ hora: horaDe(m), duracaoMin: cfg.duracao }, a));
    if (bate.length) {
      m = Math.max(...bate.map((a) => minutos(a.hora) + a.duracaoMin));
      continue;
    }
    if (m >= desde) livres.push(horaDe(m));
    m += cfg.duracao;
  }
  return livres;
}

/** A faixa de horas que a grade da semana mostra: o expediente, esticado para caber tudo o que foi marcado. */
export function faixaDaGrade(itens: ItemAgenda[], cfg: ConfigAgenda) {
  let inicio = cfg.inicio;
  let fim = cfg.fim;
  for (const a of itens) {
    if (!ocupa(a.status)) continue;
    inicio = Math.min(inicio, Math.floor(minutos(a.hora) / 60));
    fim = Math.max(fim, Math.ceil((minutos(a.hora) + a.duracaoMin) / 60));
  }
  return { inicio, fim: Math.min(fim, 24) };
}

/**
 * Na grade, horários que se cruzam dividem a largura do dia: cada um ganha uma pista e o grupo
 * sabe quantas pistas tem. `itens` precisa estar em ordem de hora.
 */
export function pistas<T extends { hora: string; duracaoMin: number }>(itens: T[]): (T & { pista: number; pistas: number })[] {
  const saida: (T & { pista: number; pistas: number })[] = [];
  let grupo: (T & { pista: number; pistas: number })[] = [];
  let fimDoGrupo = -1;
  const fechar = () => {
    const n = Math.max(1, ...grupo.map((g) => g.pista + 1));
    for (const g of grupo) g.pistas = n;
    saida.push(...grupo);
    grupo = [];
  };
  for (const it of itens) {
    const ini = minutos(it.hora);
    if (ini >= fimDoGrupo && grupo.length) fechar();
    const fins: number[] = [];
    for (const g of grupo) fins[g.pista] = Math.max(fins[g.pista] ?? 0, minutos(g.hora) + g.duracaoMin);
    let pista = fins.findIndex((f) => f <= ini);
    if (pista < 0) pista = fins.length;
    grupo.push({ ...it, pista, pistas: 1 });
    fimDoGrupo = Math.max(fimDoGrupo, ini + it.duracaoMin);
  }
  if (grupo.length) fechar();
  return saida;
}

/** A mensagem para confirmar pelo WhatsApp, com o primeiro nome e o dia por extenso. */
export function mensagemDeConfirmacao(o: { nome: string; data: Data; hora: string; atendimento: string; empresa: string; hoje: Data }) {
  const primeiro = o.nome.trim().split(/\s+/)[0];
  const [, m, d] = o.data.split("-");
  const quando = o.data === o.hoje ? "hoje" : o.data === somarDias(o.hoje, 1) ? "amanhã" : `${nomeDoDia(o.data)}, ${d}/${m}`;
  return `Oi, ${primeiro}! Aqui é da equipe ${o.empresa}. Passando para confirmar: ${o.atendimento.toLowerCase()} ${quando} às ${o.hora.replace(":00", "h")}. Posso confirmar?`;
}

export const linkWhatsapp = (telefone: string, texto: string) => `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;
