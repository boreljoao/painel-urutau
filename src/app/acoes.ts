"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { usuarios } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { conferirSenha, encerrarSessao, iniciarSessao } from "@/lib/servidor/auth";
import { formParaObjeto } from "@/lib/validacao";

/** Mesmas contas do app urutau: quem é dono ou equipe de uma empresa entra aqui com a mesma senha. */
export async function entrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = formParaObjeto(fd);
  const email = (valores.email ?? "").trim().toLowerCase();
  let u;
  try {
    [u] = await obterDb().select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  } catch (e) {
    console.error("Falha ao acessar o banco no login:", e);
    return { erros: { _: "Não deu para acessar os dados agora. Tente de novo em instantes." }, valores: { email } };
  }
  // Mesma mensagem para e-mail inexistente e senha errada.
  if (!u || !(await conferirSenha(u.senhaHash, valores.senha ?? ""))) {
    return { erros: { _: "E-mail ou senha incorretos." }, valores: { email } };
  }
  await iniciarSessao(u.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/entrar");
}
