"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/db";
import { resultadoContatoEnum } from "@/db/schema";
import { ErroRecuperacao, marcarResultado, naoContatar, registrarContato } from "@/lib/servidor/recuperacao";
import { exigirPermissao } from "@/servidor/acesso";

/**
 * Recuperar clientes no painel. Nada sai sozinho: a pessoa revisa a mensagem, abre o WhatsApp,
 * manda e só então toca em "Enviei". O resultado é marcado por quem conversou.
 */

const erroDe = (e: unknown) => (e instanceof ErroRecuperacao ? e.message : "Não foi possível salvar. Tente de novo.");
const atualizar = (empresaId: string) => revalidatePath(`/${empresaId}`, "layout");

const esquemaContato = z.object({
  clienteId: z.uuid(),
  motivo: z.enum(["ritmo", "sumiu"]),
  porque: z.string().max(300),
  mensagem: z.string().trim().min(1, "A mensagem está vazia.").max(2000),
});

export async function enviadoAcao(empresaId: string, dados: z.input<typeof esquemaContato>): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const r = esquemaContato.safeParse(dados);
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    await registrarContato(obterDb(), empresaId, ctx.usuario.id, r.data);
  } catch (e) {
    return { erro: erroDe(e) };
  }
  atualizar(empresaId);
  return {};
}

const resultado = z.enum(resultadoContatoEnum.enumValues);

export async function resultadoAcao(empresaId: string, contatoId: string, res: string, vendaId?: string | null): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const r = resultado.safeParse(res);
  if (!r.success || !z.uuid().safeParse(contatoId).success || (vendaId && !z.uuid().safeParse(vendaId).success)) return { erro: "Dados inválidos." };
  try {
    await marcarResultado(obterDb(), empresaId, ctx.usuario.id, contatoId, r.data, vendaId ?? null);
  } catch (e) {
    return { erro: erroDe(e) };
  }
  atualizar(empresaId);
  return {};
}

/** A pessoa pediu para parar (respondeu SAIR, falou com a equipe). */
export async function naoContatarAcao(empresaId: string, clienteId: string): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  if (!z.uuid().safeParse(clienteId).success) return { erro: "Cliente inválido." };
  try {
    await naoContatar(obterDb(), empresaId, ctx.usuario.id, clienteId);
  } catch (e) {
    return { erro: erroDe(e) };
  }
  atualizar(empresaId);
  return {};
}
