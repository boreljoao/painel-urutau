import { mesAtual, mesValido } from "@/lib/datas";
import { NOME_FORMA } from "@/lib/rotulos";
import { listarDespesasDoMes, listarVendasDoMes } from "@/lib/servidor/lancamentos";
import { exigirAcesso } from "@/servidor/acesso";

export const dynamic = "force-dynamic";

/** Texto de célula: aspas dobradas, e nada de começar com = + - @ (o Excel leria como fórmula). */
function celula(v: string | number) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
/** Reais com vírgula, como o Excel brasileiro espera, sem separador de milhar. */
const dinheiro = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");
const dia = (iso: string) => iso.split("-").reverse().join("/");

/** CSV do mês para o contador: vendas ou despesas, separado por ponto e vírgula e com BOM (acentos certos no Excel). */
export async function GET(req: Request, { params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const url = new URL(req.url);
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const atual = mesAtual();
  const pedido = url.searchParams.get("mes") ?? "";
  const mes = mesValido(pedido) && pedido <= atual ? pedido : atual;
  const tipo = url.searchParams.get("tipo") === "despesas" ? "despesas" : "vendas";

  let linhas: (string | number)[][];
  if (tipo === "vendas") {
    const vendas = await listarVendasDoMes(ctx, mes);
    linhas = [
      ["Dia", "Descrição", "Fonte", "Pagamento", "Situação", "Recebimento", "Valor (R$)", "Lançou"],
      ...vendas.map((v) => [dia(v.data), v.descricao || v.fonte, v.fonte, NOME_FORMA[v.formaPagamento], v.status === "recebido" ? "Recebida" : "A receber", dia(v.dataRecebimento), dinheiro(v.valor), v.autor ?? "Automático"]),
    ];
  } else {
    const despesas = await listarDespesasDoMes(ctx, mes);
    linhas = [
      ["Dia", "Descrição", "Categoria", "Situação", "Vencimento", "Pago em", "Valor (R$)"],
      ...despesas.sort((a, b) => a.data.localeCompare(b.data)).map((d) => [dia(d.data), d.descricao || d.categoria, d.categoria, d.status === "pago" ? "Paga" : "A pagar", dia(d.vencimento), d.pagoEm ? dia(d.pagoEm) : "", dinheiro(d.valor)]),
    ];
  }

  const corpo = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
  const nome = `${tipo}-${ctx.empresa.nome.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "empresa"}-${mes}.csv`;
  return new Response(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
