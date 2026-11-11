"use server";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db";
import { type StatusConversa, categoriasDespesa, clientes, despesas, fontesReceita, vendas } from "@/db/schema";
import { mudarStatusConversa } from "@/lib/servidor/atendimento";
import type { EstadoForm } from "@/lib/estado-form";
import { pode, podeAlterarLancamento } from "@/lib/permissoes";
import { ErroEstoque } from "@/lib/servidor/estoque";
import { excluirVenda, explicarOrigem, origemDaVenda, restaurarVenda } from "@/lib/servidor/ciclo-venda";
import { registrarAuditoria } from "@/lib/servidor/auditoria";
import { clienteDaEmpresa } from "@/lib/servidor/clientes";
import { conferirVenda } from "@/lib/servidor/conferencia";
import { errosPorCampo, esquemaCliente, esquemaDespesa, esquemaVenda, formParaObjeto } from "@/lib/validacao";
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

// ─── Editar, excluir e desfazer ──────────────────────────────────────────────

/** Venda ou despesa viva da empresa; só quem pode alterar (dono, ou colaborador nas próprias). */
async function lancamentoAlteravel(empresaId: string, tabela: "venda" | "despesa", id: string) {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const db = obterDb();
  const t = tabela === "venda" ? vendas : despesas;
  const [l] = await db
    .select({ criadoPor: t.criadoPor, valor: t.valorCentavos })
    .from(t)
    .where(and(eq(t.id, id), eq(t.empresaId, empresaId), isNull(t.excluidoEm)))
    .limit(1);
  if (!l) return { ctx, db, erro: "Este lançamento não existe mais." as const };
  if (!podeAlterarLancamento(ctx.papel, ctx.usuario.id, l.criadoPor)) return { ctx, db, erro: "Você só pode alterar os lançamentos que você fez." as const };
  return { ctx, db, valor: l.valor };
}

export async function editarVenda(empresaId: string, id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = formParaObjeto(fd);
  const r = esquemaVenda.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const a = await lancamentoAlteravel(empresaId, "venda", id);
  if (a.erro) return { erros: { _: a.erro }, valores };
  const { db, ctx } = a;
  const [fonte] = await db
    .select({ id: fontesReceita.id })
    .from(fontesReceita)
    .where(and(eq(fontesReceita.id, r.data.fonteReceitaId), eq(fontesReceita.empresaId, empresaId)))
    .limit(1);
  if (!fonte) return { erros: { fonteReceitaId: "Escolha de onde veio a venda" }, valores };
  if (r.data.clienteId && !(await clienteDaEmpresa(db, empresaId, r.data.clienteId))) return { erros: { clienteId: "Cliente inválido" }, valores };
  // Venda do caixa (itens e estoque) ou de um carro do pátio: o valor não muda solto aqui.
  const origem = explicarOrigem(await origemDaVenda(db, empresaId, id));
  if (!origem.valorLivre && r.data.valor !== a.valor) return { erros: { valor: origem.aviso ?? "O valor desta venda não muda por aqui." }, valores };
  await db
    .update(vendas)
    .set({
      data: r.data.data,
      valorCentavos: r.data.valor,
      descricao: r.data.descricao,
      fonteReceitaId: r.data.fonteReceitaId,
      formaPagamento: r.data.formaPagamento,
      status: r.data.status,
      dataRecebimento: r.data.dataRecebimento,
      clienteId: r.data.clienteId,
      atualizadoEm: new Date(),
    })
    .where(and(eq(vendas.id, id), eq(vendas.empresaId, empresaId)));
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "venda.editar", entidade: "venda", entidadeId: id, dados: { de: a.valor, para: r.data.valor } });
  revalidatePath(`/${empresaId}`, "layout");
  return { ok: "Alterações salvas." };
}

export async function editarDespesa(empresaId: string, id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = formParaObjeto(fd);
  const r = esquemaDespesa.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const a = await lancamentoAlteravel(empresaId, "despesa", id);
  if (a.erro) return { erros: { _: a.erro }, valores };
  const { db, ctx } = a;
  const [categoria] = await db
    .select({ id: categoriasDespesa.id })
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.id, r.data.categoriaId), eq(categoriasDespesa.empresaId, empresaId)))
    .limit(1);
  if (!categoria) return { erros: { categoriaId: "Escolha uma categoria" }, valores };
  await db
    .update(despesas)
    .set({
      data: r.data.data,
      valorCentavos: r.data.valor,
      descricao: r.data.descricao,
      categoriaId: r.data.categoriaId,
      status: r.data.status,
      vencimento: r.data.vencimento,
      pagoEm: r.data.pagoEm,
      atualizadoEm: new Date(),
    })
    .where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId)));
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "despesa.editar", entidade: "despesa", entidadeId: id, dados: { de: a.valor, para: r.data.valor } });
  revalidatePath(`/${empresaId}`, "layout");
  return { ok: "Alterações salvas." };
}

/** Exclusão suave: o lançamento some dos números, mas fica no banco e dá para desfazer. */
export async function excluirLancamento(empresaId: string, tabela: "venda" | "despesa", id: string): Promise<{ erro?: string }> {
  const a = await lancamentoAlteravel(empresaId, tabela, id);
  if (a.erro) return { erro: a.erro };
  if (tabela === "venda") {
    // Caixa devolve estoque; agenda solta o atendimento; pátio devolve o carro.
    try {
      await excluirVenda(a.db, empresaId, id, a.ctx.usuario.id, pode(a.ctx.papel, "gerenciar"));
    } catch (e) {
      if (e instanceof ErroEstoque) return { erro: e.message };
      throw e;
    }
    revalidatePath(`/${empresaId}`, "layout");
    return {};
  }
  await a.db.update(despesas).set({ excluidoEm: new Date() }).where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId), isNull(despesas.excluidoEm)));
  await registrarAuditoria(a.db, { empresaId, usuarioId: a.ctx.usuario.id, ator: "usuario", acao: "despesa.excluir", entidade: "despesa", entidadeId: id, dados: { valorCentavos: a.valor } });
  revalidatePath(`/${empresaId}`, "layout");
  return {};
}

export async function restaurarLancamento(empresaId: string, tabela: "venda" | "despesa", id: string): Promise<{ erro?: string } | void> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const db = obterDb();
  const t = tabela === "venda" ? vendas : despesas;
  const [l] = await db.select({ criadoPor: t.criadoPor }).from(t).where(and(eq(t.id, id), eq(t.empresaId, empresaId), isNotNull(t.excluidoEm))).limit(1);
  if (!l) return { erro: "Este lançamento já foi restaurado." };
  if (!podeAlterarLancamento(ctx.papel, ctx.usuario.id, l.criadoPor)) return { erro: "Você só pode alterar os lançamentos que você fez." };
  if (tabela === "venda") {
    try {
      await restaurarVenda(db, empresaId, id, ctx.usuario.id);
    } catch (e) {
      if (e instanceof ErroEstoque) return { erro: e.message };
      throw e;
    }
    revalidatePath(`/${empresaId}`, "layout");
    return;
  }
  await db.update(t).set({ excluidoEm: null }).where(and(eq(t.id, id), eq(t.empresaId, empresaId)));
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: `${tabela}.restaurar`, entidade: tabela, entidadeId: id });
  revalidatePath(`/${empresaId}`, "layout");
}

// ─── Clientes ────────────────────────────────────────────────────────────────

/** Cadastra (id nulo) ou edita um cliente. O telefone é único por empresa: é por ele que o WhatsApp acha a pessoa. */
export async function salvarCliente(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaCliente.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  if (r.data.telefone) {
    const [igual] = await db
      .select({ id: clientes.id, nome: clientes.nome })
      .from(clientes)
      .where(and(eq(clientes.empresaId, empresaId), eq(clientes.telefone, r.data.telefone), isNull(clientes.excluidoEm)))
      .limit(1);
    if (igual && igual.id !== id) return { erros: { telefone: `Este telefone já é de ${igual.nome}.` }, valores };
  }
  const dados = { nome: r.data.nome, telefone: r.data.telefone, email: r.data.email, documento: r.data.documento, observacao: r.data.observacao };
  if (id) {
    if (!(await clienteDaEmpresa(db, empresaId, id))) return { erros: { _: "Cliente não encontrado." }, valores };
    await db.update(clientes).set({ ...dados, atualizadoEm: new Date() }).where(and(eq(clientes.id, id), eq(clientes.empresaId, empresaId)));
  } else {
    const [novo] = await db.insert(clientes).values({ ...dados, empresaId, criadoPor: ctx.usuario.id, origem: "manual" }).returning({ id: clientes.id });
    await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "cliente.criar", entidade: "cliente", entidadeId: novo.id });
    revalidatePath(`/${empresaId}`, "layout");
    return { ok: "Cliente cadastrado.", valores: { id: novo.id } };
  }
  revalidatePath(`/${empresaId}`, "layout");
  return { ok: "Alterações salvas.", valores: { id } };
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
