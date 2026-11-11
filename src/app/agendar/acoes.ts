"use server";

import { and, eq, inArray } from "drizzle-orm";
import { obterDb } from "@/db";
import { agendamentos } from "@/db/schema";
import { dataValida } from "@/lib/datas";
import { registrarAuditoria } from "@/lib/servidor/auditoria";
import { acharOuCriarPorTelefone } from "@/lib/servidor/clientes";
import { normalizarTelefone } from "@/lib/validacao";
import { horaValida } from "@/pacotes/agenda";
import { agendamentoPorToken, empresaPorSlug, horarioLivre, jaPassou, semChoqueNaTransacao } from "@/servidor/agenda-publica";
import { freioPorIp } from "@/servidor/freio";
import { travarDiaDaAgenda } from "@/servidor/trava-agenda";

/**
 * O que o paciente faz sem login: marcar pela página da empresa e confirmar, cancelar ou remarcar
 * pelo link do horário. Tudo conferido de novo aqui (o horário pode ter sido ocupado enquanto a
 * página estava aberta) e com freio contra robôs.
 */

// O freio fica no banco (vale entre servidores); antes era um Map em memória que zerava a cada processo.
const freio = (nome: string, max: number, janelaMs: number) => freioPorIp(`agenda-${nome}`, max, Math.round(janelaMs / 1000));

export interface PedidoOnline {
  servico: string;
  data: string;
  hora: string;
  nome: string;
  telefone: string;
  /** Campo escondido: gente não preenche, robô preenche. */
  site?: string;
}

export async function marcarOnline(slug: string, p: PedidoOnline): Promise<{ erro?: string; token?: string }> {
  if (p.site) return { erro: "Não foi possível marcar." };
  if (!(await freio("marcar", 6, 10 * 60_000))) return { erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo." };
  const e = await empresaPorSlug(slug);
  if (!e) return { erro: "Esta página de agendamento não está mais disponível." };
  const nome = p.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 80) return { erro: "Escreva seu nome." };
  const telefone = normalizarTelefone(p.telefone);
  if (!telefone) return { erro: "Confira o WhatsApp: DDD e número, como (21) 99999-8888." };
  if (!dataValida(p.data) || !horaValida(p.hora)) return { erro: "Escolha um dia e um horário." };
  const servico = e.cfg.servicos.includes(p.servico) ? p.servico : (e.cfg.servicos[0] ?? e.cfg.atendimento);
  if (!(await horarioLivre(e, p.data, p.hora))) return { erro: "Esse horário acabou de ser ocupado. Escolha outro." };

  const db = obterDb();
  const { cliente } = await acharOuCriarPorTelefone(db, e.empresa.id, telefone, nome, "site");
  const novo = await db.transaction(async (tx) => {
    // Na fila do dia: confere de novo depois de quem chegou antes gravar.
    await travarDiaDaAgenda(tx, e.empresa.id, p.data);
    if (!(await semChoqueNaTransacao(tx, e, p.data, p.hora))) return null;
    const [n] = await tx
    .insert(agendamentos)
    .values({
      empresaId: e.empresa.id,
      data: p.data,
      hora: p.hora,
      duracaoMin: e.cfg.duracao,
      clienteId: cliente.id,
      nome,
      servico,
      origem: "online",
      observacao: "Marcado pela página de agendamento.",
    })
    .returning({ id: agendamentos.id, token: agendamentos.tokenPaciente });
    return n;
  });
  if (!novo) return { erro: "Esse horário acabou de ser ocupado. Escolha outro." };
  await registrarAuditoria(db, { empresaId: e.empresa.id, ator: "sistema", acao: "agenda.marcar", entidade: "agendamento", entidadeId: novo.id, dados: { origem: "online" } });
  return { token: novo.token };
}

export async function responderPaciente(token: string, acao: "confirmar" | "cancelar"): Promise<{ erro?: string }> {
  if (!(await freio("responder", 20, 10 * 60_000))) return { erro: "Muitas tentativas seguidas. Espere alguns minutos." };
  const a = await agendamentoPorToken(token);
  if (!a) return { erro: "Este link não vale mais." };
  if (jaPassou(a.ag)) return { erro: "Este horário já passou." };
  if (a.ag.status !== "marcado" && a.ag.status !== "confirmado") return { erro: "Este horário não pode mais ser mudado por aqui. Fale com a equipe." };
  const status = acao === "confirmar" ? "confirmado" : "cancelado";
  const db = obterDb();
  // Confere o estado na própria gravação: se a equipe acabou de concluir, o link não sobrescreve.
  const [mudou] = await db
    .update(agendamentos)
    .set({ status, respondidoEm: new Date(), atualizadoEm: new Date() })
    .where(and(eq(agendamentos.id, a.ag.id), eq(agendamentos.empresaId, a.ag.empresaId), inArray(agendamentos.status, ["marcado", "confirmado"])))
    .returning({ id: agendamentos.id });
  if (!mudou) return { erro: "Este horário não pode mais ser mudado por aqui. Fale com a equipe." };
  await registrarAuditoria(db, { empresaId: a.ag.empresaId, ator: "sistema", acao: `agenda.${status}`, entidade: "agendamento", entidadeId: a.ag.id, dados: { pelo: "paciente" } });
  return {};
}

export async function remarcarPaciente(token: string, data: string, hora: string): Promise<{ erro?: string }> {
  if (!(await freio("responder", 20, 10 * 60_000))) return { erro: "Muitas tentativas seguidas. Espere alguns minutos." };
  const a = await agendamentoPorToken(token);
  if (!a?.config?.slug) return { erro: "Este link não vale mais." };
  if (jaPassou(a.ag)) return { erro: "Este horário já passou." };
  if (a.ag.status !== "marcado" && a.ag.status !== "confirmado") return { erro: "Este horário não pode mais ser mudado por aqui. Fale com a equipe." };
  if (!dataValida(data) || !horaValida(hora)) return { erro: "Escolha um dia e um horário." };
  const e = await empresaPorSlug(a.config.slug);
  if (!e) return { erro: "A remarcação pela internet está desligada. Fale com a equipe." };
  if (!(await horarioLivre(e, data, hora, a.ag.id))) return { erro: "Esse horário acabou de ser ocupado. Escolha outro." };
  const db = obterDb();
  const ok = await db.transaction(async (tx) => {
    await travarDiaDaAgenda(tx, a.ag.empresaId, data);
    if (!(await semChoqueNaTransacao(tx, e, data, hora, a.ag.id))) return false;
    const [mudou] = await tx
      .update(agendamentos)
      // Remarcado volta a "marcado" e os lembretes recomeçam para o novo horário.
      .set({ data, hora, status: "marcado", lembretes: {}, respondidoEm: new Date(), atualizadoEm: new Date() })
      .where(and(eq(agendamentos.id, a.ag.id), eq(agendamentos.empresaId, a.ag.empresaId), inArray(agendamentos.status, ["marcado", "confirmado"])))
      .returning({ id: agendamentos.id });
    return !!mudou;
  });
  if (!ok) return { erro: "Esse horário acabou de ser ocupado ou já foi mudado pela equipe. Escolha outro." };
  await registrarAuditoria(db, { empresaId: a.ag.empresaId, ator: "sistema", acao: "agenda.remarcar", entidade: "agendamento", entidadeId: a.ag.id, dados: { de: `${a.ag.data} ${a.ag.hora}`, para: `${data} ${hora}` } });
  return {};
}
