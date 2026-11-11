import "server-only";
import { sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";

type Tx = Parameters<Parameters<BancoDeDados["transaction"]>[0]>[0];

/**
 * Fila por empresa e dia (auditoria F05). Dentro da transação, quem chega depois espera o
 * primeiro gravar e só então confere se o horário está livre: duas pessoas clicando no mesmo
 * horário ao mesmo tempo não marcam as duas. Dias diferentes e empresas diferentes não se esperam.
 */
export async function travarDiaDaAgenda(tx: Tx, empresaId: string, data: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agenda:${empresaId}:${data}`}, 0))`);
}
