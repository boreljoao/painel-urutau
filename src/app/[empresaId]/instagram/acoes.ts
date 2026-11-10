"use server";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { obterDb } from "@/db";
import { postsInstagram } from "@/db/schema";
import { exigirPermissao } from "@/servidor/acesso";
import {
  ErroInstagram,
  canaisDoBuffer,
  contaDaEmpresa,
  desligarConta,
  listarPosts,
  novoPost,
  processarCriacao,
  processarEnvio,
  salvarConta,
} from "@/servidor/instagram";

/** Os posts da empresa, para a tela ao vivo (o celular e o notebook perguntam a cada 2 segundos). */
export async function postsAoVivo(empresaId: string) {
  await exigirPermissao(empresaId, "lancar");
  return listarPosts(obterDb(), empresaId);
}

export async function criarPost(empresaId: string, tema: string): Promise<{ erro?: string; id?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const assunto = tema.trim();
  if (assunto.length < 3) return { erro: "Conte em poucas palavras sobre o que é o post." };
  if (assunto.length > 600) return { erro: "Resuma o assunto em até 600 caracteres." };
  const db = obterDb();
  const id = await novoPost(db, empresaId, assunto, ctx.usuario.id);
  after(() => processarCriacao(db, id));
  return { id };
}

export async function enviarPost(empresaId: string, postId: string, agora: boolean): Promise<{ erro?: string }> {
  await exigirPermissao(empresaId, "lancar");
  const db = obterDb();
  if (!(await contaDaEmpresa(db, empresaId))) return { erro: "Ligue o Buffer da empresa antes de enviar." };
  const [mudou] = await db
    .update(postsInstagram)
    .set({ situacao: "enviando", envio: agora ? "agora" : "fila", erro: null, atualizadoEm: new Date() })
    .where(and(eq(postsInstagram.id, postId), eq(postsInstagram.empresaId, empresaId)))
    .returning({ conteudo: postsInstagram.conteudo });
  if (!mudou?.conteudo) return { erro: "Este post ainda não está pronto." };
  after(() => processarEnvio(db, empresaId, postId, agora));
  return {};
}

export async function excluirPost(empresaId: string, postId: string) {
  await exigirPermissao(empresaId, "lancar");
  await obterDb().delete(postsInstagram).where(and(eq(postsInstagram.id, postId), eq(postsInstagram.empresaId, empresaId)));
}

/** Passo 1 da ligação: confere a chave e devolve os perfis de Instagram dela. */
export async function buscarCanais(empresaId: string, chave: string) {
  await exigirPermissao(empresaId, "gerenciar");
  const token = chave.trim();
  if (token.length < 10) return { erro: "Cole a chave da API do Buffer." };
  try {
    const canais = await canaisDoBuffer(token);
    if (!canais.length) return { erro: "Essa conta do Buffer não tem nenhum Instagram ligado. Ligue o perfil no Buffer e tente de novo." };
    return { canais };
  } catch (e) {
    return { erro: e instanceof ErroInstagram ? e.message : "Não foi possível falar com o Buffer agora." };
  }
}

/** Passo 2: guarda a chave (cifrada) e o perfil escolhido. */
export async function ligarBuffer(empresaId: string, chave: string, canalId: string): Promise<{ erro?: string }> {
  await exigirPermissao(empresaId, "gerenciar");
  try {
    const canal = (await canaisDoBuffer(chave.trim())).find((c) => c.id === canalId);
    if (!canal) return { erro: "Esse perfil não está mais nessa conta do Buffer." };
    await salvarConta(obterDb(), empresaId, chave.trim(), canal);
    return {};
  } catch (e) {
    return { erro: e instanceof ErroInstagram ? e.message : "Não foi possível falar com o Buffer agora." };
  }
}

export async function desligarBuffer(empresaId: string) {
  await exigirPermissao(empresaId, "gerenciar");
  await desligarConta(obterDb(), empresaId);
}
