"use server";

import { z } from "zod";
import { obterDb } from "@/db";
import { notasEquipe } from "@/db/schema";
import { ehDemo } from "@/lib/demo";
import type { EstadoForm } from "@/lib/estado-form";
import { exigirAcesso } from "@/servidor/acesso";

const esquema = z.object({
  texto: z.string().trim().min(3, "Escreva um pouco mais").max(2000, "Até 2.000 caracteres"),
  tela: z.string().trim().max(200).optional(),
  contato: z.string().optional(),
  retorno: z.string().trim().max(120).optional(),
});

/**
 * A opinião vai para as notas da equipe Urutau, presa à empresa: aparece na central de quem cuida
 * do cliente, com o nome de quem escreveu.
 */
export async function enviarOpiniao(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { usuario, empresa } = await exigirAcesso(empresaId);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { erros: { texto: r.error.issues[0]?.message ?? "Confira o texto." } };
  const { texto, tela, contato, retorno } = r.data;
  const demo = ehDemo(usuario.email);
  const cabeca = [
    demo ? `Opinião de visitante (exemplo de ${empresa.nome})` : `Opinião pelo painel · ${usuario.nome} <${usuario.email}>`,
    demo && retorno && `retorno: ${retorno}`,
    tela && `tela ${tela}`,
    !demo && (contato ? "pode chamar" : "não pediu retorno"),
  ]
    .filter(Boolean)
    .join(" · ");
  await obterDb()
    .insert(notasEquipe)
    .values({ autorId: usuario.id, empresaId: demo ? null : empresaId, texto: `${cabeca}\n\n${texto}` });
  return { ok: "Recebemos. Obrigado por contar." };
}
