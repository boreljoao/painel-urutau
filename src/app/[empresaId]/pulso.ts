"use server";

import { and, eq, isNotNull, max, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { agendamentos, auditoria } from "@/db/schema";
import { exigirPermissao } from "@/servidor/acesso";

/**
 * O "pulso" da empresa: um texto que muda sempre que algo muda (um horário marcado, confirmado,
 * remarcado ou cancelado; uma venda, um boleto pago, um estoque mexido). A tela pergunta de tempos
 * em tempos e só se redesenha quando o pulso é outro.
 */
export async function pulsoDaEmpresa(empresaId: string): Promise<string> {
  await exigirPermissao(empresaId, "ver_clientes");
  const db = obterDb();
  const [[agenda], [eventos]] = await Promise.all([
    db
      .select({ ultimo: max(agendamentos.atualizadoEm), total: sql<number>`count(*)`.mapWith(Number) })
      .from(agendamentos)
      .where(eq(agendamentos.empresaId, empresaId)),
    db
      .select({ ultimo: max(auditoria.criadoEm) })
      .from(auditoria)
      .where(and(eq(auditoria.empresaId, empresaId), isNotNull(auditoria.acao))),
  ]);
  return `${agenda?.ultimo?.toISOString() ?? "-"}|${agenda?.total ?? 0}|${eventos?.ultimo?.toISOString() ?? "-"}`;
}
