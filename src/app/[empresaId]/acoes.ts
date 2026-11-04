"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db";
import { type StatusConversa, categoriasDespesa, despesas, fontesReceita, vendas } from "@/db/schema";
import { mudarStatusConversa } from "@/lib/servidor/atendimento";
import type { EstadoForm } from "@/lib/estado-form";
import { clienteDaEmpresa } from "@/lib/servidor/clientes";
import { conferirVenda } from "@/lib/servidor/conferencia";
import { errosPorCampo, esquemaDespesa, esquemaVenda, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "@/servidor/acesso";

/** O dono dá o check numa venda que entrou sozinha (WhatsApp, site). */
export async function conferir(empresaId: string, vendaId: string): Promise<{ erro?: string } | void> {
  const ctx = await exigirPermissao(empresaId, "conferir");
  const ok = await conferirVenda(obterDb(), empresaId, vendaId, ctx.usuario.id);
  revalidatePath(`/${empresaId}`, "layout");
  if (!ok) return { erro: "Esta venda já foi conferida ou foi excluída." };
}

/** Venda lançada à mão pelo painel. As mesmas regras do app: fonte e cliente têm de ser desta empresa. */
export async function lancarVenda(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaVenda.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  const [fonte] = await db
    .select({ id: fontesReceita.id })
    .from(fontesReceita)
    .where(and(eq(fontesReceita.id, r.data.fonteReceitaId), eq(fontesReceita.empresaId, empresaId)))
    .limit(1);
  if (!fonte) return { erros: { fonteReceitaId: "Escolha de onde veio a venda" }, valores };
  if (r.data.clienteId && !(await clienteDaEmpresa(db, empresaId, r.data.clienteId))) return { erros: { clienteId: "Cliente inválido" }, valores };
  await db.insert(vendas).values({
    empresaId,
    criadoPor: ctx.usuario.id,
    data: r.data.data,
    valorCentavos: r.data.valor,
    descricao: r.data.descricao,
    fonteReceitaId: r.data.fonteReceitaId,
    formaPagamento: r.data.formaPagamento,
    status: r.data.status,
    dataRecebimento: r.data.dataRecebimento,
    clienteId: r.data.clienteId,
  });
  revalidatePath(`/${empresaId}`, "layout");
  return { ok: "Venda salva." };
}

export async function lancarDespesa(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaDespesa.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  const [categoria] = await db
    .select({ id: categoriasDespesa.id })
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.id, r.data.categoriaId), eq(categoriasDespesa.empresaId, empresaId)))
    .limit(1);
  if (!categoria) return { erros: { categoriaId: "Escolha uma categoria" }, valores };
  await db.insert(despesas).values({
    empresaId,
    criadoPor: ctx.usuario.id,
    data: r.data.data,
    valorCentavos: r.data.valor,
    descricao: r.data.descricao,
    categoriaId: r.data.categoriaId,
    status: r.data.status,
    vencimento: r.data.vencimento,
    pagoEm: r.data.pagoEm,
  });
  revalidatePath(`/${empresaId}`, "layout");
  return { ok: "Despesa salva." };
}

/**
 * Assumir, devolver ao atendente ou encerrar. Diferente do app, não chama a IA daqui:
 * quando a conversa volta ao atendente com o cliente esperando, a resposta fica na fila
 * e o app urutau a responde na próxima volta da fila (a cada 5 minutos).
 */
export async function mudarStatusConversaAcao(empresaId: string, conversaId: string, status: StatusConversa): Promise<{ erro?: string } | void> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  if (!ctx.modulos.has("whatsapp")) return { erro: "O atendente de WhatsApp não está ligado para esta empresa." };
  try {
    await mudarStatusConversa(obterDb(), empresaId, conversaId, status);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo." };
  }
  revalidatePath(`/${empresaId}`, "layout");
}
