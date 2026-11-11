import "server-only";
import { headers } from "next/headers";
import { obterDb } from "@/db";
import { ehDemo } from "@/lib/demo";
import { consumirLimite } from "@/lib/servidor/limites";

/**
 * Freios contra abuso (auditoria S01/S02). A contagem fica no banco (limites_uso): vale entre
 * todos os servidores da Vercel e não zera quando um processo novo sobe.
 */

/** IP de quem chamou. Na Vercel, o primeiro de x-forwarded-for é o que a própria Vercel viu. */
export async function ipDaRequisicao() {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** true = pode seguir. Se o banco falhar, deixa passar (o freio não pode derrubar o login). */
export async function freio(chave: string, max: number, janelaSegundos: number) {
  try {
    return await consumirLimite(obterDb(), chave, max, janelaSegundos);
  } catch (e) {
    console.error("freio: falha ao contar", chave, e);
    return true;
  }
}

/** Freio por IP: `nome` separa os contadores (login, cadastro, demo…). */
export async function freioPorIp(nome: string, max: number, janelaSegundos: number) {
  return freio(`${nome}:ip:${await ipDaRequisicao()}`, max, janelaSegundos);
}

/** Conta de demonstração não chama IA paga, não publica e não sobe arquivos (bloqueio no servidor). */
export function bloqueioDaDemo(usuario: { email: string }): string | null {
  return ehDemo(usuario.email) ? "Na demonstração isto fica desligado. Crie sua conta para usar a IA, publicar e enviar arquivos." : null;
}

/** Orçamento diário de IA por empresa (gerar e planejar posts). */
export const IA_POR_DIA = 40;
