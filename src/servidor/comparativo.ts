import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { vendas } from "@/db/schema";
import { type Data, type Mes, diasNoMes, intervaloDoMes, somarDias, somarMeses } from "@/lib/datas";

/**
 * Faturamento do mês anterior até o mesmo dia do mês. Comparar o mês que ainda corre com o mês
 * anterior inteiro faria todo começo de mês parecer uma queda.
 */
export async function faturamentoDoMesAnteriorAteODia(db: BancoDeDados, empresaId: string, mes: Mes, dia: number) {
  const anterior = somarMeses(mes, -1);
  const { inicio } = intervaloDoMes(anterior);
  const ate: Data = somarDias(inicio, Math.min(dia, diasNoMes(anterior))); // limite de cima, não incluso
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${vendas.valorCentavos}), 0)::bigint`.mapWith(Number) })
    .from(vendas)
    .where(and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm), gte(vendas.data, inicio), lt(vendas.data, ate)));
  return r?.total ?? 0;
}
