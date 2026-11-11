"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/db";
import { type StatusVeiculo, fontesReceita, statusVeiculoEnum, vendas, veiculos } from "@/db/schema";
import { dataValida, hoje } from "@/lib/datas";
import { lerReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";
import { registrarAuditoria } from "@/lib/servidor/auditoria";
import { clienteDaEmpresa } from "@/lib/servidor/clientes";
import { errosPorCampo, formParaObjeto, valorEmReais } from "@/lib/validacao";
import { exigirPermissao } from "@/servidor/acesso";
import { veiculoDaEmpresa } from "@/servidor/patio";

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .transform((s) => s || null);

/** Dinheiro opcional: vazio vira null. */
const reaisOpcional = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s || !s.trim()) return null;
    const c = lerReais(s);
    if (c === null || c < 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido. Exemplo: 45.900,00" });
      return z.NEVER;
    }
    return c;
  });

const inteiro = (min: number, max: number, msg: string) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      const limpo = (s ?? "").replace(/\D/g, "");
      if (!limpo) return null;
      const n = Number(limpo);
      if (n < min || n > max) {
        ctx.addIssue({ code: "custom", message: msg });
        return z.NEVER;
      }
      return n;
    });

const esquemaVeiculo = z.object({
  modelo: z.string({ message: "Informe o carro" }).trim().min(2, "Informe o carro").max(120),
  placa: z
    .string()
    .optional()
    .transform((s) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : ""))
    .refine((s) => !s || /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(s), "Placa inválida. Exemplo: ABC1D23")
    .transform((s) => s || null),
  ano: inteiro(1950, new Date().getFullYear() + 1, "Ano inválido"),
  km: inteiro(0, 2_000_000, "Quilometragem inválida"),
  cor: texto(40),
  status: z.enum(["preparacao", "disponivel", "reservado"], { message: "Escolha a situação" }),
  custoCompra: reaisOpcional,
  custoPreparacao: reaisOpcional,
  preco: reaisOpcional,
  entradaEm: z.string({ message: "Informe a data de entrada" }).refine((d) => dataValida(d) && d <= hoje(), "Informe a data de entrada"),
  observacao: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((s) => s ?? ""),
});

function revalidar(empresaId: string) {
  revalidatePath(`/${empresaId}`, "layout");
}

/** Cadastra ou edita um carro do pátio. */
export async function salvarVeiculo(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaVeiculo.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const d = r.data;
  const db = obterDb();
  const campos = {
    modelo: d.modelo,
    placa: d.placa,
    ano: d.ano,
    km: d.km,
    cor: d.cor,
    custoCompraCentavos: d.custoCompra ?? 0,
    custoPreparacaoCentavos: d.custoPreparacao ?? 0,
    precoCentavos: d.preco,
    entradaEm: d.entradaEm,
    observacao: d.observacao,
    atualizadoEm: new Date(),
  };
  if (id) {
    const atual = await veiculoDaEmpresa(empresaId, id);
    if (!atual) return { erros: { _: "Este carro não existe mais." }, valores };
    // Carro vendido mantém a situação; os outros seguem o que foi escolhido.
    await db
      .update(veiculos)
      .set({ ...campos, ...(atual.status === "vendido" ? {} : { status: d.status }) })
      .where(eq(veiculos.id, id));
    await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "patio.editar", entidade: "veiculo", entidadeId: id, dados: { modelo: d.modelo } });
    revalidar(empresaId);
    return { ok: "Carro atualizado.", valores };
  }
  const [novo] = await db
    .insert(veiculos)
    .values({ ...campos, empresaId, status: d.status, criadoPor: ctx.usuario.id })
    .returning({ id: veiculos.id });
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "patio.entrada", entidade: "veiculo", entidadeId: novo.id, dados: { modelo: d.modelo } });
  revalidar(empresaId);
  return { ok: "Carro no pátio.", valores };
}

/** Troca a situação do carro no pátio (preparação, disponível, reservado). Vender é outra ação. */
export async function mudarStatusVeiculo(empresaId: string, id: string, status: StatusVeiculo): Promise<{ erro?: string } | void> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  if (!statusVeiculoEnum.enumValues.includes(status) || status === "vendido") return { erro: "Situação inválida." };
  const v = await veiculoDaEmpresa(empresaId, id);
  if (!v) return { erro: "Este carro não existe mais." };
  if (v.status === "vendido") return { erro: "Este carro já foi vendido." };
  const db = obterDb();
  await db.update(veiculos).set({ status, atualizadoEm: new Date() }).where(eq(veiculos.id, id));
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "patio.status", entidade: "veiculo", entidadeId: id, dados: { modelo: v.modelo, status } });
  revalidar(empresaId);
}

const esquemaVender = z.object({
  valor: valorEmReais,
  data: z.string({ message: "Informe o dia" }).refine((d) => dataValida(d) && d <= hoje(), "Informe o dia da venda"),
  formaPagamento: z.enum(["dinheiro", "pix", "debito", "credito", "boleto", "transferencia", "outro"], { message: "Escolha a forma de pagamento" }),
  status: z.enum(["recebido", "a_receber"], { message: "Diga se já recebeu" }),
  fonteReceitaId: z.string({ message: "Escolha a fonte" }).uuid("Escolha a fonte"),
  clienteId: z
    .string()
    .optional()
    .transform((s) => s || null),
});

/** O carro foi vendido: a venda entra nas vendas (caixa, imposto) e o carro sai do pátio com o lucro. */
export async function venderVeiculo(empresaId: string, id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaVender.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const v = await veiculoDaEmpresa(empresaId, id);
  if (!v) return { erros: { _: "Este carro não existe mais." }, valores };
  if (v.status === "vendido") return { erros: { _: "Este carro já foi vendido." }, valores };
  const db = obterDb();
  const [fonte] = await db
    .select({ id: fontesReceita.id })
    .from(fontesReceita)
    .where(and(eq(fontesReceita.id, r.data.fonteReceitaId), eq(fontesReceita.empresaId, empresaId)))
    .limit(1);
  if (!fonte) return { erros: { fonteReceitaId: "Escolha a fonte" }, valores };
  if (r.data.clienteId && !(await clienteDaEmpresa(db, empresaId, r.data.clienteId))) return { erros: { clienteId: "Cliente inválido" }, valores };
  // Trava o carro: duas vendas ao mesmo tempo não lançam duas receitas para o mesmo carro.
  const vendaId = await db.transaction(async (tx) => {
    const [livre] = await tx
      .select({ status: veiculos.status, vendaId: veiculos.vendaId })
      .from(veiculos)
      .where(and(eq(veiculos.id, id), eq(veiculos.empresaId, empresaId), isNull(veiculos.excluidoEm)))
      .for("update");
    if (!livre || livre.vendaId || livre.status === "vendido") return null;
    const [venda] = await tx
      .insert(vendas)
      .values({
        empresaId,
        data: r.data.data,
        valorCentavos: r.data.valor,
        descricao: [v.modelo, v.ano, v.placa].filter(Boolean).join(" · "),
        fonteReceitaId: r.data.fonteReceitaId,
        formaPagamento: r.data.formaPagamento,
        status: r.data.status,
        dataRecebimento: r.data.data,
        clienteId: r.data.clienteId,
        criadoPor: ctx.usuario.id,
      })
      .returning({ id: vendas.id });
    const [ok] = await tx
      .update(veiculos)
      .set({ status: "vendido", valorVendaCentavos: r.data.valor, vendidoEm: r.data.data, vendaId: venda.id, clienteId: r.data.clienteId, atualizadoEm: new Date() })
      .where(and(eq(veiculos.id, id), isNull(veiculos.vendaId)))
      .returning({ id: veiculos.id });
    if (!ok) throw new Error("O carro mudou durante a venda.");
    return venda.id;
  });
  if (!vendaId) return { erros: { _: "Este carro já foi vendido." }, valores };
  await registrarAuditoria(db, {
    empresaId,
    usuarioId: ctx.usuario.id,
    ator: "usuario",
    acao: "patio.venda",
    entidade: "veiculo",
    entidadeId: id,
    dados: { modelo: v.modelo, vendaId, lucro: r.data.valor - v.custoCompraCentavos - v.custoPreparacaoCentavos },
  });
  revalidar(empresaId);
  return { ok: "Venda lançada.", valores };
}

/** Tira o carro do pátio (cadastro errado). Se já tinha venda, a venda continua nas vendas. */
export async function excluirVeiculo(empresaId: string, id: string): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const v = await veiculoDaEmpresa(empresaId, id);
  if (!v) return { erro: "Este carro não existe mais." };
  const db = obterDb();
  await db.update(veiculos).set({ excluidoEm: new Date() }).where(eq(veiculos.id, id));
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "patio.excluir", entidade: "veiculo", entidadeId: id, dados: { modelo: v.modelo } });
  revalidar(empresaId);
  return {};
}
