import type { StatusAgendamento } from "@/db/schema";
import { type Data, somarDias } from "@/lib/datas";
import { nomeDoDia } from "./agenda";

/**
 * Os três lembretes de um horário marcado e quando cada um vence, sem banco:
 * - "marcado": logo depois de marcar, com o link para confirmar;
 * - "h48": 48 horas antes, pedindo a confirmação (o que mais evita falta: dá tempo de remarcar);
 * - "h2": 2 horas antes, o último aviso.
 * Só um lembrete por vez: se o horário foi marcado em cima da hora, vai direto o mais próximo.
 */

export type TipoLembrete = "marcado" | "h48" | "h2";
export const NOME_LEMBRETE: Record<TipoLembrete, string> = { marcado: "Ao marcar", h48: "48h antes", h2: "2h antes" };

const HORA = 3_600_000;

/** O começo do horário (data e hora de Brasília, UTC−3). */
export const inicioDe = (a: { data: Data; hora: string }) => new Date(`${a.data}T${a.hora}:00-03:00`);

export interface ParaLembrar {
  data: Data;
  hora: string;
  status: StatusAgendamento;
  lembretes: Partial<Record<TipoLembrete, string>>;
}

export function lembreteDevido(a: ParaLembrar, agora = new Date()): TipoLembrete | null {
  if (a.status !== "marcado" && a.status !== "confirmado") return null;
  const falta = inicioDe(a).getTime() - agora.getTime();
  if (falta <= 0) return null;
  const enviado = a.lembretes;
  if (falta <= 2 * HORA) return enviado.h2 ? null : "h2";
  // Já confirmado não precisa do pedido de confirmação; só do aviso de 2h.
  if (a.status === "confirmado") return null;
  if (falta <= 48 * HORA) {
    if (enviado.h48) return null;
    // Quem recebeu o link de marcação há pouco não precisa de outro pedido no mesmo dia.
    if (enviado.marcado && falta < 24 * HORA) return null;
    return "h48";
  }
  return enviado.marcado ? null : "marcado";
}

const quandoTexto = (data: Data, hora: string, hoje: Data) => {
  const [, m, d] = data.split("-");
  const dia = data === hoje ? "hoje" : data === somarDias(hoje, 1) ? "amanhã" : `${nomeDoDia(data)}, ${d}/${m},`;
  return `${dia} às ${hora.replace(":00", "h")}`;
};

export function textoLembrete(
  tipo: TipoLembrete,
  o: { nome: string; data: Data; hora: string; atendimento: string; empresa: string; link: string; hoje: Data },
) {
  const primeiro = o.nome.trim().split(/\s+/)[0];
  const quando = quandoTexto(o.data, o.hora, o.hoje);
  const oque = o.atendimento.toLowerCase();
  // Concordância: "sua sessão marcada", "seu atendimento marcado".
  const f = /(ão|a)$/.test(oque);
  const seu = f ? "sua" : "seu";
  const marcado = f ? "marcada" : "marcado";
  const Seu = `${seu.charAt(0).toUpperCase()}${seu.slice(1)}`;
  // Sem artigo antes do nome da empresa ("da Consultório" soa errado; "do"/"da" depende do nome).
  if (tipo === "h2") return `Oi, ${primeiro}! Lembrete de ${o.empresa}: ${seu} ${oque} é ${quando}. Te esperamos! Se precisar mudar: ${o.link}`;
  if (tipo === "h48") return `Oi, ${primeiro}! ${o.empresa} aqui. ${Seu} ${oque} está ${marcado} para ${quando}. Confirma pra gente? É só tocar: ${o.link}`;
  return `Oi, ${primeiro}! ${Seu} ${oque} ficou ${marcado} para ${quando} (${o.empresa}). Para confirmar, remarcar ou cancelar: ${o.link}`;
}
