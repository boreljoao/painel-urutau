"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/db";
import { auditoria, usuarios } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { ehDemo } from "@/lib/demo";
import { VERSAO_TERMOS } from "@/lib/legal";
import { conferirSenha, encerrarSessao, hashSenha, iniciarSessao } from "@/lib/servidor/auth";
import { errosPorCampo, formParaObjeto } from "@/lib/validacao";
import { freio, freioPorIp } from "@/servidor/freio";

/** Mesmas contas do app urutau: quem é dono ou equipe de uma empresa entra aqui com a mesma senha. */
export async function entrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = formParaObjeto(fd);
  const email = (valores.email ?? "").trim().toLowerCase().slice(0, 200);
  const senha = valores.senha ?? "";
  // Tamanho antes do Argon2 (senha gigante custa CPU) e freio por IP e por conta.
  if (senha.length > 200) return { erros: { _: "E-mail ou senha incorretos." }, valores: { email } };
  if (!(await freioPorIp("login", 30, 15 * 60)) || !(await freio(`login:conta:${email}`, 10, 15 * 60)))
    return { erros: { _: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo." }, valores: { email } };
  let u;
  try {
    [u] = await obterDb().select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  } catch (e) {
    console.error("Falha ao acessar o banco no login:", e);
    return { erros: { _: "Não deu para acessar os dados agora. Tente de novo em instantes." }, valores: { email } };
  }
  // Mesma mensagem para e-mail inexistente e senha errada.
  if (!u || !(await conferirSenha(u.senhaHash, senha))) {
    return { erros: { _: "E-mail ou senha incorretos." }, valores: { email } };
  }
  await iniciarSessao(u.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/entrar");
}

const esquemaCadastro = z.object({
  nome: z.string().trim().min(2, "Informe o seu nome").max(80, "Nome muito longo"),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(200),
  aceite: z.literal("on", { error: "Para criar a conta, aceite os termos e a política de privacidade" }),
});

/** Qualquer pessoa cria a própria conta e cai direto na criação da empresa. */
export async function cadastrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = formParaObjeto(fd);
  const devolver = { nome: valores.nome ?? "", email: valores.email ?? "" };
  // Campo escondido: gente não vê nem preenche; robô de formulário preenche.
  if (valores.site) return { erros: { _: "Não deu para criar a conta. Tente de novo." }, valores: devolver };
  const r = esquemaCadastro.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores: devolver };
  const { nome, email, senha } = r.data;
  if (ehDemo(email)) return { erros: { email: "E-mail inválido" }, valores: devolver };
  if (!(await freioPorIp("cadastro", 5, 60 * 60))) return { erros: { _: "Muitas contas criadas daqui agora. Tente de novo mais tarde." }, valores: devolver };
  const db = obterDb();
  let id: string;
  try {
    const [ja] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    if (ja) return { erros: { email: "Esse e-mail já tem conta. Entre com ele." }, valores: devolver };
    const senhaHash = await hashSenha(senha);
    id = await db.transaction(async (tx) => {
      const [u] = await tx.insert(usuarios).values({ nome, email, senhaHash }).returning({ id: usuarios.id });
      // O aceite fica registrado com a versão dos textos que a pessoa leu.
      await tx.insert(auditoria).values({ usuarioId: u.id, ator: "usuario", acao: "termos.aceitar", entidade: "usuario", entidadeId: u.id, dados: { versao: VERSAO_TERMOS } });
      return u.id;
    });
  } catch (e) {
    // Dois envios ao mesmo tempo: o índice único do e-mail segura o segundo.
    if ((e as { code?: string })?.code === "23505") return { erros: { email: "Esse e-mail já tem conta. Entre com ele." }, valores: devolver };
    console.error("Falha ao criar a conta:", e);
    return { erros: { _: "Não deu para criar a conta agora. Tente de novo em instantes." }, valores: devolver };
  }
  await iniciarSessao(id);
  redirect("/nova-empresa");
}
