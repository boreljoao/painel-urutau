import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { obterDb } from "@/db";
import { type StatusVeiculo, veiculos } from "@/db/schema";
import { type Data, hoje } from "@/lib/datas";

export const NOME_STATUS_VEICULO: Record<StatusVeiculo, string> = { preparacao: "Em preparação", disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido" };

const DIA = 86_400_000;
export const diasEntre = (de: Data, ate: Data) => Math.max(0, Math.round((new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / DIA));

export type LinhaVeiculo = typeof veiculos.$inferSelect & { custoTotal: number; lucro: number | null; dias: number };

function completar(v: typeof veiculos.$inferSelect, hj: Data): LinhaVeiculo {
  const custoTotal = v.custoCompraCentavos + v.custoPreparacaoCentavos;
  const vendaOuPreco = v.status === "vendido" ? v.valorVendaCentavos : v.precoCentavos;
  return { ...v, custoTotal, lucro: vendaOuPreco == null ? null : vendaOuPreco - custoTotal, dias: diasEntre(v.entradaEm, v.vendidoEm ?? hj) };
}

/** Os carros que estão no pátio agora (tudo menos os vendidos), do mais antigo para o mais novo. */
export async function carrosNoPatio(empresaId: string) {
  const hj = hoje();
  const linhas = await obterDb()
    .select()
    .from(veiculos)
    .where(and(eq(veiculos.empresaId, empresaId), isNull(veiculos.excluidoEm), ne(veiculos.status, "vendido")))
    .orderBy(asc(veiculos.entradaEm));
  return linhas.map((v) => completar(v, hj));
}

/** Os vendidos entre duas datas, do mais recente para o mais antigo. */
export async function vendidosEntre(empresaId: string, de: Data, ate: Data) {
  const hj = hoje();
  const linhas = await obterDb()
    .select()
    .from(veiculos)
    .where(and(eq(veiculos.empresaId, empresaId), isNull(veiculos.excluidoEm), eq(veiculos.status, "vendido"), gte(veiculos.vendidoEm, de), lte(veiculos.vendidoEm, ate)))
    .orderBy(desc(veiculos.vendidoEm));
  return linhas.map((v) => completar(v, hj));
}

export async function veiculoDaEmpresa(empresaId: string, id: string) {
  const [v] = await obterDb()
    .select()
    .from(veiculos)
    .where(and(eq(veiculos.id, id), eq(veiculos.empresaId, empresaId), isNull(veiculos.excluidoEm)))
    .limit(1);
  return v ?? null;
}

/** Resumo do pátio: quantos em cada situação e o dinheiro parado neles. */
export function resumoDoPatio(carros: LinhaVeiculo[]) {
  const por = (s: StatusVeiculo) => carros.filter((c) => c.status === s);
  return {
    disponiveis: por("disponivel").length,
    reservados: por("reservado").length,
    preparacao: por("preparacao").length,
    capitalParado: carros.reduce((t, c) => t + c.custoTotal, 0),
    parados60: carros.filter((c) => c.dias >= 60).length,
  };
}
