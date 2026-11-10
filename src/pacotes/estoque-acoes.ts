"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/db";
import { formaPagamentoEnum, unidadeProdutoEnum } from "@/db/schema";
import { lerReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";
import { UNIDADES, lerQuantidade, limparCodigo } from "@/lib/estoque";
import type { Acao } from "@/lib/permissoes";
import { ErroEstoque, cancelarVendaCaixa, registrarEntrada, registrarPerda, registrarVendaCaixa, salvarProduto, type VendaDoCaixa } from "@/lib/servidor/estoque";
import { registrarAuditoria } from "@/lib/servidor/auditoria";
import { exigirPermissao } from "@/servidor/acesso";

/**
 * Estoque e caixa no painel: as mesmas regras do app (src/lib/servidor/estoque.ts). O preço vem
 * do cadastro, a venda baixa o estoque uma vez só e o estorno devolve as quantidades.
 */

const RAMOS_COM_ESTOQUE = ["varejo", "alimentacao"];

async function exigirEstoque(empresaId: string, acao: Acao) {
  const ctx = await exigirPermissao(empresaId, acao);
  if (!ctx.modulos.has("estoque") && !RAMOS_COM_ESTOQUE.includes(ctx.empresa.perfil)) throw new Error("O estoque não faz parte do pacote desta empresa.");
  return ctx;
}

const erroDe = (e: unknown) => (e instanceof ErroEstoque ? e.message : "Não foi possível concluir. Tente de novo.");

function atualizar(empresaId: string) {
  revalidatePath(`/${empresaId}`, "layout");
}

export async function salvarProdutoAcao(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirEstoque(empresaId, "lancar");
  const valores = Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const erros: Record<string, string> = {};
  const unidade = unidadeProdutoEnum.enumValues.includes(valores.unidade as never) ? (valores.unidade as (typeof unidadeProdutoEnum.enumValues)[number]) : "un";
  const nome = (valores.nome ?? "").trim();
  if (!nome) erros.nome = "Dê um nome ao produto.";
  const preco = lerReais(valores.preco ?? "");
  if (preco === null || preco < 0) erros.preco = "Preço inválido. Exemplo: 12,90";
  const minimo = valores.minimo?.trim() ? lerQuantidade(valores.minimo, unidade) : 0;
  if (minimo === null || minimo < 0) erros.minimo = UNIDADES[unidade].fracionada ? "Quantidade inválida. Exemplo: 2,5" : "Use um número inteiro.";
  let inicial: { saldoMil: number; custoCentavos: number } | undefined;
  if (!id) {
    const saldo = valores.saldoInicial?.trim() ? lerQuantidade(valores.saldoInicial, unidade) : 0;
    const custo = valores.custoInicial?.trim() ? lerReais(valores.custoInicial) : 0;
    if (saldo === null || saldo < 0) erros.saldoInicial = "Quantidade inválida.";
    if (custo === null || custo < 0) erros.custoInicial = "Custo inválido.";
    if (saldo && saldo > 0 && !custo) erros.custoInicial = "Informe quanto custou cada unidade (para a margem e o valor do estoque).";
    inicial = { saldoMil: saldo ?? 0, custoCentavos: custo ?? 0 };
  }
  if (Object.keys(erros).length) return { erros, valores };
  try {
    const produtoId = await salvarProduto(
      obterDb(),
      empresaId,
      id,
      {
        nome: nome.slice(0, 200),
        sku: valores.sku?.trim().slice(0, 60) || null,
        codigoBarras: limparCodigo(valores.codigoBarras ?? "") || null,
        categoria: (valores.categoria ?? "").trim().slice(0, 60),
        unidade,
        precoCentavos: preco!,
        minimoMil: minimo!,
        controlaEstoque: valores.controlaEstoque === "on",
        ativo: id ? valores.ativo === "on" : true,
      },
      ctx.usuario.id,
      inicial,
    );
    if (!id) await registrarAuditoria(obterDb(), { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "estoque.ajuste", entidade: "produto", entidadeId: produtoId, dados: { novo: true } });
  } catch (e) {
    if (e instanceof ErroEstoque) return { erros: { [e.message.includes("barras") ? "codigoBarras" : e.message.includes("SKU") ? "sku" : "_"]: e.message }, valores };
    throw e;
  }
  atualizar(empresaId);
  return { ok: id ? "Produto salvo." : "Produto cadastrado." };
}

/** Chegou mercadoria de um produto: soma ao saldo, refaz o custo médio e, se pedido, lança a compra nas contas. */
export async function entradaAcao(empresaId: string, produtoId: string, unidade: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirEstoque(empresaId, "lancar");
  const valores = Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const un = unidadeProdutoEnum.enumValues.includes(unidade as never) ? (unidade as "un") : "un";
  const qtd = lerQuantidade(valores.quantidade ?? "", un);
  const custo = lerReais(valores.custo ?? "");
  const erros: Record<string, string> = {};
  if (!qtd || qtd <= 0) erros.quantidade = "Informe quanto chegou.";
  if (custo === null || custo < 0) erros.custo = "Informe o custo de cada unidade.";
  const lancar = valores.lancar ?? "nao";
  const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(valores.vencimento ?? "") ? valores.vencimento : null;
  if (lancar === "a_pagar" && !vencimento) erros.vencimento = "Informe o vencimento.";
  if (Object.keys(erros).length) return { erros, valores };
  try {
    const db = obterDb();
    await registrarEntrada(db, empresaId, ctx.usuario.id, {
      linhas: [{ produtoId, quantidadeMil: qtd!, custoUnitarioCentavos: custo! }],
      documento: valores.documento?.trim().slice(0, 60) || null,
      fornecedor: valores.fornecedor?.trim().slice(0, 120) || null,
      despesa: lancar === "nao" ? null : { vencimento: vencimento ?? new Date().toISOString().slice(0, 10), pago: lancar === "pago" },
    });
    await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "estoque.entrada", entidade: "produto", entidadeId: produtoId, dados: { quantidadeMil: qtd } });
  } catch (e) {
    return { erros: { _: erroDe(e) }, valores };
  }
  atualizar(empresaId);
  return { ok: "Entrada registrada." };
}

export async function perdaAcao(empresaId: string, produtoId: string, unidade: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirEstoque(empresaId, "lancar");
  const qtd = lerQuantidade(String(fd.get("quantidade") ?? ""), unidadeProdutoEnum.enumValues.includes(unidade as never) ? (unidade as "un") : "un");
  if (!qtd || qtd <= 0) return { erros: { quantidade: "Informe a quantidade." } };
  try {
    await registrarPerda(obterDb(), empresaId, ctx.usuario.id, produtoId, qtd, String(fd.get("motivo") ?? "").trim().slice(0, 200));
  } catch (e) {
    return { erros: { _: erroDe(e) } };
  }
  atualizar(empresaId);
  return { ok: "Baixa registrada." };
}

const esquemaVenda = z.object({
  itens: z
    .array(
      z.object({
        produtoId: z.uuid().nullable(),
        descricao: z.string().trim().max(200).optional(),
        quantidadeMil: z.number().int().positive().max(1_000_000_000),
        precoUnitarioCentavos: z.number().int().min(0).optional(),
        descontoCentavos: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(500),
  descontoCentavos: z.number().int().min(0),
  formaPagamento: z.enum(formaPagamentoEnum.enumValues),
  clienteId: z.uuid().nullable(),
  aReceber: z.boolean(),
});

export async function venderAcao(empresaId: string, venda: VendaDoCaixa): Promise<{ erro: string } | { vendaId: string; totalCentavos: number; estoqueNegativo: string[] }> {
  const ctx = await exigirEstoque(empresaId, "lancar");
  const r = esquemaVenda.safeParse(venda);
  if (!r.success) return { erro: "O carrinho tem algo inválido. Confira as quantidades." };
  try {
    const db = obterDb();
    const feito = await registrarVendaCaixa(db, empresaId, ctx.usuario.id, r.data);
    // A venda do balcão aparece na Atividade e acorda as telas ao vivo.
    await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "venda.pdv", entidade: "venda", entidadeId: feito.vendaId, dados: { totalCentavos: feito.totalCentavos } });
    atualizar(empresaId);
    return feito;
  } catch (e) {
    return { erro: erroDe(e) };
  }
}

/** Estorno: a venda sai do financeiro e as quantidades voltam ao estoque. */
export async function cancelarVendaAcao(empresaId: string, vendaId: string): Promise<{ erro?: string } | void> {
  const ctx = await exigirEstoque(empresaId, "gerenciar");
  try {
    await cancelarVendaCaixa(obterDb(), empresaId, vendaId, ctx.usuario.id, "Estornada no caixa do painel");
  } catch (e) {
    return { erro: erroDe(e) };
  }
  atualizar(empresaId);
}
