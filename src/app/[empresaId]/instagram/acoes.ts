"use server";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { obterDb } from "@/db";
import { type ArquivoPostInstagram, type FormatoPostInstagram, postsInstagram } from "@/db/schema";
import { analisar } from "@/lib/instagram/analise";
import { exigirPermissao } from "@/servidor/acesso";
import { IA_POR_DIA, bloqueioDaDemo, freio } from "@/servidor/freio";
import {
  type DadosPost,
  ErroInstagram,
  type Quando,
  canaisDoBuffer,
  contaDaEmpresa,
  desligarConta,
  listarPosts,
  excluirPostComBuffer,
  motivoParaNaoEnviar,
  planejarSemana,
  postDaEmpresa,
  processarCriacao,
  reservarEnvio,
  processarEnvio,
  salvarConta,
  salvarRascunho,
  sincronizar,
} from "@/servidor/instagram";

const FORMATOS: FormatoPostInstagram[] = ["post", "carrossel", "reel", "story"];

/** Os posts da empresa para as telas ao vivo; de quebra pergunta ao Buffer o que já saiu. */
export async function postsAoVivo(empresaId: string) {
  await exigirPermissao(empresaId, "lancar");
  const db = obterDb();
  after(() => sincronizar(db, empresaId).catch((e) => console.error("instagram: sincronia", e)));
  return listarPosts(db, empresaId);
}

export interface FormularioPost {
  tema: string;
  objetivo: string;
  orientacoes: string;
  formato: FormatoPostInstagram;
  arquivos: ArquivoPostInstagram[];
  modo: "revisar" | "automatico";
  /** ISO com fuso, ou vazio para a fila do Buffer. */
  agendadoPara: string;
}

function validar(f: FormularioPost): DadosPost | string {
  const tema = f.tema.trim();
  if (tema.length < 3) return "Conte em poucas palavras sobre o que é o post.";
  if (tema.length > 600 || f.orientacoes.length > 1500) return "Texto longo demais. Resuma um pouco.";
  if (!FORMATOS.includes(f.formato)) return "Formato inválido.";
  if (f.arquivos.length > 12) return "No máximo 12 arquivos por post.";
  const arquivos = f.arquivos.filter((a) => /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(a.url) || a.tipo === "link");
  if (f.formato === "reel" && !arquivos.some((a) => a.tipo === "video")) return "Reel precisa de um vídeo. Envie o vídeo nos materiais.";
  const agendadoPara = f.agendadoPara ? new Date(f.agendadoPara) : null;
  if (agendadoPara && Number.isNaN(agendadoPara.getTime())) return "Data inválida.";
  return { tema, objetivo: f.objetivo || null, orientacoes: f.orientacoes.trim() || null, formato: f.formato, arquivos, modo: f.modo, agendadoPara };
}

export async function salvarRascunhoAcao(empresaId: string, f: FormularioPost, postId?: string): Promise<{ erro?: string; id?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const dados = validar({ ...f, tema: f.tema || "Rascunho" });
  if (typeof dados === "string") return { erro: dados };
  return { id: await salvarRascunho(obterDb(), empresaId, ctx.usuario.id, dados, postId) };
}

/** Salva o que está no formulário e manda a IA escrever. */
export async function gerarPost(empresaId: string, f: FormularioPost, postId?: string): Promise<{ erro?: string; id?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const dados = validar(f);
  if (typeof dados === "string") return { erro: dados };
  const demo = bloqueioDaDemo(ctx.usuario);
  if (demo) return { erro: demo };
  if (!(await freio(`ia:empresa:${empresaId}`, IA_POR_DIA, 24 * 60 * 60))) return { erro: `A empresa já usou os ${IA_POR_DIA} posts de IA de hoje. Amanhã libera de novo.` };
  const db = obterDb();
  const id = await salvarRascunho(db, empresaId, ctx.usuario.id, dados, postId);
  await db.update(postsInstagram).set({ situacao: "criando", erro: null, conteudo: null, analise: null, atualizadoEm: new Date() }).where(eq(postsInstagram.id, id));
  after(() => processarCriacao(db, id));
  return { id };
}

/** Quick start (tela antiga e ações rápidas): só o assunto. */
export async function criarPost(empresaId: string, tema: string): Promise<{ erro?: string; id?: string }> {
  return gerarPost(empresaId, { tema, objetivo: "", orientacoes: "", formato: "post", arquivos: [], modo: "revisar", agendadoPara: "" });
}

/** O dono mexeu no texto: grava e confere de novo. */
export async function editarTexto(empresaId: string, postId: string, gancho: string, legenda: string): Promise<{ erro?: string }> {
  await exigirPermissao(empresaId, "lancar");
  const db = obterDb();
  const post = await postDaEmpresa(db, empresaId, postId);
  if (!post?.conteudo) return { erro: "Este post ainda não tem texto." };
  if (legenda.length > 2200) return { erro: "A legenda passa de 2.200 caracteres." };
  const hashtags = [...legenda.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]);
  const corpo = legenda.replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu, "").trim();
  const { conteudo, analise } = analisar({ ...post.conteudo, gancho: gancho.trim() || post.conteudo.gancho, legenda: corpo, hashtags });
  await db.update(postsInstagram).set({ conteudo, analise, atualizadoEm: new Date() }).where(eq(postsInstagram.id, postId));
  return {};
}

export async function enviarPost(empresaId: string, postId: string, quando: { tipo: "agora" | "fila" } | { tipo: "data"; em: string }): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const demo = bloqueioDaDemo(ctx.usuario);
  if (demo) return { erro: demo };
  const db = obterDb();
  if (!(await contaDaEmpresa(db, empresaId))) return { erro: "Ligue o Instagram da empresa (Buffer) antes de enviar." };
  const post = await postDaEmpresa(db, empresaId, postId);
  if (!post) return { erro: "Este post não existe mais." };
  const motivo = motivoParaNaoEnviar(post);
  if (motivo) return { erro: motivo };
  let alvo: Quando;
  if (quando.tipo === "data") {
    const em = new Date(quando.em);
    if (Number.isNaN(em.getTime()) || em.getTime() < Date.now() + 5 * 60_000) return { erro: "Escolha uma data e hora pelo menos 5 minutos à frente." };
    alvo = { tipo: "data", em };
  } else alvo = { tipo: quando.tipo };
  // Só um envio por post: a segunda chamada (clique duplo, outra aba) não passa daqui.
  if (!(await reservarEnvio(db, empresaId, postId, alvo.tipo))) return { erro: "Este post já está sendo enviado ou já foi enviado." };
  after(() => processarEnvio(db, empresaId, postId, alvo));
  return {};
}

/** Agendado: cancela no Buffer antes. Publicado: some do painel, mas continua no Instagram. */
export async function excluirPost(empresaId: string, postId: string): Promise<{ erro?: string; continuaNoInstagram?: boolean }> {
  await exigirPermissao(empresaId, "lancar");
  return excluirPostComBuffer(obterDb(), empresaId, postId);
}

export async function planejarSemanaAcao(empresaId: string, contexto: string): Promise<{ erro?: string; quantos?: number }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const demo = bloqueioDaDemo(ctx.usuario);
  if (demo) return { erro: demo };
  // Planejar a semana gera vários posts: conta 7 do orçamento do dia.
  for (let i = 0; i < 7; i++)
    if (!(await freio(`ia:empresa:${empresaId}`, IA_POR_DIA, 24 * 60 * 60))) return { erro: `A empresa já usou os ${IA_POR_DIA} posts de IA de hoje. Amanhã libera de novo.` };
  const db = obterDb();
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  try {
    const ids = await planejarSemana(db, empresaId, ctx.usuario.id, contexto.slice(0, 1500), hoje);
    after(async () => {
      for (const id of ids) await processarCriacao(db, id);
    });
    return { quantos: ids.length };
  } catch (e) {
    return { erro: e instanceof ErroInstagram ? e.message : "A IA não conseguiu planejar agora. Tente de novo." };
  }
}

/** Passo 1 da ligação: confere a chave e devolve os perfis de Instagram dela. */
export async function buscarCanais(empresaId: string, chave: string) {
  const ctx = await exigirPermissao(empresaId, "gerenciar");
  const demo = bloqueioDaDemo(ctx.usuario);
  if (demo) return { erro: demo };
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
  const ctx = await exigirPermissao(empresaId, "gerenciar");
  const demo = bloqueioDaDemo(ctx.usuario);
  if (demo) return { erro: demo };
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
