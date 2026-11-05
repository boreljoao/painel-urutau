"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/db";
import { type StatusAgendamento, agendamentos, clientes, fontesReceita, statusAgendamentoEnum, vendas } from "@/db/schema";
import { dataValida, hoje, somarDias } from "@/lib/datas";
import { lerReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";
import { registrarAuditoria } from "@/lib/servidor/auditoria";
import { errosPorCampo, formParaObjeto, normalizarTelefone, valorEmReais } from "@/lib/validacao";
import { exigirPermissao } from "@/servidor/acesso";
import { agendamentoDaEmpresa, listarAgenda } from "@/servidor/agenda";
import { agendaDoPacote } from "./catalogo";
import { choques, horaValida } from "./agenda";

const texto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres`).optional().transform((s) => s ?? "");

const esquemaAgendamento = z.object({
  nome: z.string({ message: "Informe quem vem" }).trim().min(2, "Informe quem vem").max(120),
  clienteId: z.string().optional().transform((s) => s || null).refine((s) => s === null || z.string().uuid().safeParse(s).success, "Cliente inválido"),
  telefone: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || !s.trim()) return null;
      const t = normalizarTelefone(s);
      if (!t) {
        ctx.addIssue({ code: "custom", message: "Telefone inválido. Exemplo: (21) 99999-8888" });
        return z.NEVER;
      }
      return t;
    }),
  data: z.string({ message: "Informe o dia" }).refine((d) => dataValida(d), "Informe o dia"),
  hora: z.string({ message: "Informe a hora" }).refine((h) => horaValida(h), "Informe a hora"),
  duracao: z.coerce.number({ message: "Informe a duração" }).int("Duração em minutos").min(5, "No mínimo 5 minutos").max(720, "No máximo 12 horas"),
  servico: texto(120),
  profissional: texto(80),
  sala: texto(60),
  valor: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || !s.trim()) return null;
      const c = lerReais(s);
      if (c === null || c <= 0) {
        ctx.addIssue({ code: "custom", message: "Valor inválido. Exemplo: 180,00" });
        return z.NEVER;
      }
      return c;
    }),
  observacao: texto(1000),
  forcar: z.string().optional(),
});

function revalidar(empresaId: string) {
  revalidatePath(`/${empresaId}`, "layout");
}

/**
 * Liga o horário a um cliente: o escolhido na lista, o de mesmo nome, o de mesmo telefone ou um
 * novo (só quando veio telefone: sem ele, o horário fica só com o nome). Cliente sem telefone
 * ganha o que foi digitado, para dar para confirmar pelo WhatsApp.
 */
async function resolverCliente(empresaId: string, usuarioId: string, d: { clienteId: string | null; nome: string; telefone: string | null }) {
  const db = obterDb();
  const vivo = and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm));
  let c: { id: string; telefone: string | null } | undefined;
  if (d.clienteId) [c] = await db.select({ id: clientes.id, telefone: clientes.telefone }).from(clientes).where(and(vivo, eq(clientes.id, d.clienteId))).limit(1);
  if (!c && d.telefone) [c] = await db.select({ id: clientes.id, telefone: clientes.telefone }).from(clientes).where(and(vivo, eq(clientes.telefone, d.telefone))).limit(1);
  if (!c) [c] = await db.select({ id: clientes.id, telefone: clientes.telefone }).from(clientes).where(and(vivo, sql`lower(${clientes.nome}) = lower(${d.nome})`)).limit(1);
  if (c) {
    if (!c.telefone && d.telefone) {
      const [dono] = await db.select({ id: clientes.id }).from(clientes).where(and(vivo, eq(clientes.telefone, d.telefone))).limit(1);
      if (!dono) await db.update(clientes).set({ telefone: d.telefone, atualizadoEm: new Date() }).where(eq(clientes.id, c.id));
    }
    return c.id;
  }
  if (!d.telefone) return null;
  const [novo] = await db.insert(clientes).values({ empresaId, nome: d.nome, telefone: d.telefone, origem: "manual", criadoPor: usuarioId }).returning({ id: clientes.id });
  return novo.id;
}

/** Marcar um horário novo (id null) ou alterar um marcado. Avisa quando cruza com outro horário. */
export async function salvarAgendamento(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  if (!agendaDoPacote(ctx.empresa.perfil)) return { erros: { _: "A agenda não faz parte do pacote desta empresa." }, valores };
  const r = esquemaAgendamento.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const d = r.data;
  if (id && !(await agendamentoDaEmpresa(empresaId, id))) return { erros: { _: "Este horário não existe mais." }, valores };

  if (!d.forcar) {
    const dia = await listarAgenda(empresaId, d.data, somarDias(d.data, 1));
    const bate = choques({ id: id ?? undefined, data: d.data, hora: d.hora, duracaoMin: d.duracao, profissional: d.profissional, sala: d.sala }, dia);
    if (bate.length) {
      const b = bate[0];
      const com = b.profissional ? ` com ${b.profissional}` : b.sala ? ` na ${b.sala}` : "";
      return { erros: { _: `Já tem ${b.nome} às ${b.hora}${com}. Confira o horário ou marque mesmo assim.` }, valores: { ...valores, forcar: "1" } };
    }
  }

  const clienteId = await resolverCliente(empresaId, ctx.usuario.id, d);
  const dados = {
    data: d.data,
    hora: d.hora,
    duracaoMin: d.duracao,
    clienteId,
    nome: d.nome,
    servico: d.servico,
    profissional: d.profissional,
    sala: d.sala,
    valorCentavos: d.valor,
    observacao: d.observacao,
  };
  const db = obterDb();
  if (id) {
    await db.update(agendamentos).set({ ...dados, atualizadoEm: new Date() }).where(and(eq(agendamentos.id, id), eq(agendamentos.empresaId, empresaId)));
  } else {
    const [novo] = await db.insert(agendamentos).values({ ...dados, empresaId, criadoPor: ctx.usuario.id }).returning({ id: agendamentos.id });
    await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "agenda.marcar", entidade: "agendamento", entidadeId: novo.id });
  }
  revalidar(empresaId);
  return { ok: id ? "Horário alterado." : "Horário marcado.", valores: { data: d.data } };
}

const statusValido = z.enum(statusAgendamentoEnum.enumValues);

/** Confirmar, atendido, faltou, cancelar ou voltar para marcado. */
export async function mudarStatusAgendamento(empresaId: string, id: string, status: StatusAgendamento): Promise<{ erro?: string } | void> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  if (!statusValido.safeParse(status).success) return { erro: "Situação inválida." };
  const a = await agendamentoDaEmpresa(empresaId, id);
  if (!a) return { erro: "Este horário não existe mais." };
  if (a.vendaId && status !== "atendido") return { erro: "Este atendimento já virou recebimento. Exclua o recebimento antes de mudar." };
  const db = obterDb();
  await db.update(agendamentos).set({ status, atualizadoEm: new Date() }).where(and(eq(agendamentos.id, id), eq(agendamentos.empresaId, empresaId)));
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: `agenda.${status}`, entidade: "agendamento", entidadeId: id });
  revalidar(empresaId);
}

export async function excluirAgendamento(empresaId: string, id: string): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const a = await agendamentoDaEmpresa(empresaId, id);
  if (!a) return { erro: "Este horário não existe mais." };
  const db = obterDb();
  await db.update(agendamentos).set({ excluidoEm: new Date() }).where(and(eq(agendamentos.id, id), eq(agendamentos.empresaId, empresaId)));
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "agenda.excluir", entidade: "agendamento", entidadeId: id });
  revalidar(empresaId);
  return {};
}

export async function restaurarAgendamento(empresaId: string, id: string): Promise<{ erro?: string } | void> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const db = obterDb();
  const r = await db
    .update(agendamentos)
    .set({ excluidoEm: null, atualizadoEm: new Date() })
    .where(and(eq(agendamentos.id, id), eq(agendamentos.empresaId, empresaId)))
    .returning({ id: agendamentos.id });
  if (!r.length) return { erro: "Não deu para desfazer." };
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "agenda.restaurar", entidade: "agendamento", entidadeId: id });
  revalidar(empresaId);
}

const esquemaReceber = z.object({
  valor: valorEmReais,
  formaPagamento: z.enum(["dinheiro", "pix", "debito", "credito", "boleto", "transferencia", "outro"], { message: "Escolha a forma de pagamento" }),
  status: z.enum(["recebido", "a_receber"], { message: "Diga se já recebeu" }),
  fonteReceitaId: z.string({ message: "Escolha a fonte" }).uuid("Escolha a fonte"),
});

/**
 * O atendimento aconteceu e foi pago (ou vai ser): lança o recebimento nas vendas, ligado ao
 * cliente, e marca o horário como atendido. É o que leva a agenda para o caixa e o imposto.
 */
export async function receberAgendamento(empresaId: string, id: string, rotulo: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaReceber.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const a = await agendamentoDaEmpresa(empresaId, id);
  if (!a) return { erros: { _: "Este horário não existe mais." }, valores };
  if (a.vendaId) return { erros: { _: "Este atendimento já foi lançado." }, valores };
  const db = obterDb();
  const [fonte] = await db
    .select({ id: fontesReceita.id })
    .from(fontesReceita)
    .where(and(eq(fontesReceita.id, r.data.fonteReceitaId), eq(fontesReceita.empresaId, empresaId)))
    .limit(1);
  if (!fonte) return { erros: { fonteReceitaId: "Escolha a fonte" }, valores };
  // Venda não pode ficar no futuro: atendimento recebido adiantado entra no dia de hoje.
  const dia = a.data > hoje() ? hoje() : a.data;
  const vendaId = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(vendas)
      .values({
        empresaId,
        data: dia,
        valorCentavos: r.data.valor,
        descricao: `${a.servico || rotulo} · ${a.nome}`,
        fonteReceitaId: r.data.fonteReceitaId,
        formaPagamento: r.data.formaPagamento,
        status: r.data.status,
        dataRecebimento: dia,
        clienteId: a.clienteId,
        origem: "agenda",
        criadoPor: ctx.usuario.id,
      })
      .returning({ id: vendas.id });
    await tx.update(agendamentos).set({ vendaId: v.id, status: "atendido", atualizadoEm: new Date() }).where(eq(agendamentos.id, id));
    return v.id;
  });
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "agenda.receber", entidade: "agendamento", entidadeId: id, dados: { vendaId } });
  revalidar(empresaId);
  return { ok: "Recebimento lançado." };
}
