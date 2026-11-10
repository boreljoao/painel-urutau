import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { BancoDeDados } from "@/db";
import { type ConteudoPostInstagram, contasInstagram, empresas, postsInstagram } from "@/db/schema";
import { analisar } from "@/lib/instagram/analise";
import { pacoteDe } from "@/pacotes/catalogo";
import { type CriarMensagem, ErroAtendimento, comSubstituto, criarPadrao } from "@/lib/servidor/atendimento";
import { cifrar, decifrar } from "@/lib/servidor/segredos";

/**
 * Instagram no painel: a IA escreve o post e a arte, o painel confere (nota do gancho, legenda,
 * limpeza) e envia pelo Buffer da empresa. Cada etapa grava a situação no banco, então o celular
 * e o notebook abertos na mesma empresa veem o post andar ao mesmo tempo.
 */

export const MODELO_INSTAGRAM = "claude-opus-5-5";
const BUFFER = "https://api.buffer.com";

export class ErroInstagram extends Error {}

// ─── Geração ─────────────────────────────────────────────────────────────────

const esquema = z.object({
  gancho: z.string().describe("Primeira frase do post, 5 a 12 palavras, com algo concreto e algo em jogo."),
  legenda: z.string().describe("Legenda completa em português do Brasil, sem hashtags."),
  hashtags: z.array(z.string()).describe("De 3 a 5 hashtags, sem o #."),
  arte: z.object({
    titulo: z.string().describe("Título da arte, no máximo 6 palavras."),
    subtitulo: z.string().describe("Apoio do título, no máximo 14 palavras."),
    selo: z.string().describe("Etiqueta curta no topo da arte, 1 a 3 palavras."),
  }),
  roteiroReel: z.array(z.string()).describe("Roteiro falado de um Reel de 20 a 30 segundos, uma fala por item, de 5 a 8 falas."),
  textoAlternativo: z.string().describe("Descrição da arte para acessibilidade."),
});

const SISTEMA = `Você escreve posts de Instagram para pequenas empresas brasileiras, no jeito de falar de quem é dono do negócio.

Regras:
- Português do Brasil, frases curtas, sem travessão, sem clichê de marketing (alavancar, potencializar, jornada, ecossistema, revolucionário, no cenário atual).
- O gancho abre a legenda e tem de funcionar sozinho no feed: começa pelo fato, sem saudação e sem "neste post".
- Nunca invente números, clientes, prêmios ou resultados. Use só os fatos que vierem no pedido. Sem um número real, escreva sem número.
- Uma única chamada para ação no fim, de preferência "Comente PALAVRA" ou "Me chama no direct".
- Hashtags em português, específicas do ramo e da cidade quando houver.`;

export async function gerarConteudo(
  empresa: { nome: string; ramo: string; cidade: string | null },
  tema: string,
  criar: CriarMensagem = criarPadrao,
): Promise<ConteudoPostInstagram> {
  const pedido = [
    `Empresa: ${empresa.nome}`,
    `Ramo: ${empresa.ramo}`,
    empresa.cidade ? `Cidade: ${empresa.cidade}` : null,
    `Assunto do post: ${tema}`,
  ]
    .filter(Boolean)
    .join("\n");
  const r = await criar({
    model: MODELO_INSTAGRAM,
    max_tokens: 4000,
    system: SISTEMA,
    messages: [{ role: "user", content: pedido }],
    output_config: { effort: "low", format: zodOutputFormat(esquema) },
    ...comSubstituto(MODELO_INSTAGRAM),
  });
  if (r.stop_reason === "refusal") throw new ErroInstagram("A IA não quis escrever sobre esse assunto. Tente outro tema.");
  const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const lido = esquema.safeParse(JSON.parse(texto || "{}"));
  if (!lido.success) throw new ErroInstagram("A IA respondeu fora do formato. Tente de novo.");
  return lido.data;
}

// ─── Buffer ──────────────────────────────────────────────────────────────────

const textoGraphql = (s: string) => JSON.stringify(s);

async function chamarBuffer<T>(token: string, consulta: string): Promise<T> {
  const r = await fetch(BUFFER, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: consulta }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await r.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] };
  if (r.status === 401 || r.status === 403) throw new ErroInstagram("O Buffer recusou a chave. Gere uma nova em publish.buffer.com/settings/api.");
  if (!r.ok || json.errors?.length || !json.data) throw new ErroInstagram(`Buffer: ${json.errors?.[0]?.message ?? `HTTP ${r.status}`}`);
  return json.data;
}

export interface CanalBuffer {
  id: string;
  nome: string;
}

/** Os perfis de Instagram ligados ao Buffer desta chave. */
export async function canaisDoBuffer(token: string): Promise<CanalBuffer[]> {
  const { account } = await chamarBuffer<{ account: { organizations: { id: string }[] } }>(
    token,
    "query { account { organizations { id } } }",
  );
  const listas = await Promise.all(
    account.organizations.map((o) =>
      chamarBuffer<{ channels: { id: string; name: string; displayName: string | null; service: string }[] }>(
        token,
        `query { channels(input: { organizationId: ${textoGraphql(o.id)} }) { id name displayName service } }`,
      ),
    ),
  );
  return listas
    .flatMap((l) => l.channels)
    .filter((c) => c.service.toLowerCase() === "instagram")
    .map((c) => ({ id: c.id, nome: c.displayName || c.name }));
}

async function publicarNoBuffer(token: string, canalId: string, post: { legenda: string; arteUrl: string; alt: string; agora: boolean }) {
  const mutacao = `mutation {
    createPost(input: {
      text: ${textoGraphql(post.legenda)}
      channelId: ${textoGraphql(canalId)}
      schedulingType: automatic
      mode: ${post.agora ? "shareNow" : "addToQueue"}
      assets: [{ image: { url: ${textoGraphql(post.arteUrl)}, metadata: { altText: ${textoGraphql(post.alt)} } } }]
      metadata: { instagram: { type: post, shouldShareToFeed: true } }
    }) {
      ... on PostActionSuccess { post { id } }
      ... on MutationError { message }
    }
  }`;
  const { createPost } = await chamarBuffer<{ createPost: { post?: { id: string }; message?: string } }>(token, mutacao);
  if (!createPost.post) throw new ErroInstagram(`Buffer: ${createPost.message ?? "não aceitou o post"}`);
  return createPost.post.id;
}

// ─── Conta da empresa ────────────────────────────────────────────────────────

export async function contaDaEmpresa(db: BancoDeDados, empresaId: string) {
  const [c] = await db.select().from(contasInstagram).where(eq(contasInstagram.empresaId, empresaId));
  return c ?? null;
}

export async function salvarConta(db: BancoDeDados, empresaId: string, token: string, canal: CanalBuffer) {
  const valores = { bufferTokenCifrado: cifrar(token), canalId: canal.id, canalNome: canal.nome, atualizadoEm: new Date() };
  await db.insert(contasInstagram).values({ empresaId, ...valores }).onConflictDoUpdate({ target: contasInstagram.empresaId, set: valores });
}

export async function desligarConta(db: BancoDeDados, empresaId: string) {
  await db.delete(contasInstagram).where(eq(contasInstagram.empresaId, empresaId));
}

// ─── Posts e as etapas ───────────────────────────────────────────────────────

export function urlPublica() {
  const fixa = process.env.URL_PUBLICA?.replace(/\/$/, "");
  if (fixa) return fixa;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3100";
}

export const arteDoPost = (postId: string) => `${urlPublica()}/arte/${postId}.png`;

export async function listarPosts(db: BancoDeDados, empresaId: string) {
  return db.select().from(postsInstagram).where(eq(postsInstagram.empresaId, empresaId)).orderBy(desc(postsInstagram.criadoEm)).limit(30);
}

export type PostInstagram = Awaited<ReturnType<typeof listarPosts>>[number];

async function mudar(db: BancoDeDados, postId: string, campos: Partial<typeof postsInstagram.$inferInsert>) {
  await db.update(postsInstagram).set({ ...campos, atualizadoEm: new Date() }).where(eq(postsInstagram.id, postId));
}

const mensagem = (e: unknown) =>
  e instanceof ErroInstagram || e instanceof ErroAtendimento
    ? e.message
    : e instanceof Anthropic.AuthenticationError
      ? "A chave da IA não está configurada. Avise a equipe Urutau."
      : e instanceof Anthropic.APIError
        ? "A IA não respondeu agora. Tente de novo em instantes."
        : "Não deu certo. Tente de novo.";

export async function novoPost(db: BancoDeDados, empresaId: string, tema: string, usuarioId: string) {
  const [p] = await db.insert(postsInstagram).values({ empresaId, tema, criadoPor: usuarioId }).returning({ id: postsInstagram.id });
  return p.id;
}

/** Criar → analisar → pronto. Roda depois da resposta (after), cada etapa gravada. */
export async function processarCriacao(db: BancoDeDados, postId: string, criar?: CriarMensagem) {
  const [linha] = await db
    .select({ tema: postsInstagram.tema, nome: empresas.nome, perfil: empresas.perfil, cidade: empresas.cidade })
    .from(postsInstagram)
    .innerJoin(empresas, eq(empresas.id, postsInstagram.empresaId))
    .where(eq(postsInstagram.id, postId));
  if (!linha) return;
  try {
    const bruto = await gerarConteudo({ nome: linha.nome, ramo: pacoteDe(linha.perfil).nome, cidade: linha.cidade }, linha.tema, criar);
    await mudar(db, postId, { situacao: "analisando", conteudo: bruto });
    const { conteudo, analise } = analisar(bruto);
    // Uma pausa curta para a etapa aparecer na tela de quem acompanha.
    await new Promise((r) => setTimeout(r, 1200));
    await mudar(db, postId, { situacao: "pronto", conteudo, analise });
  } catch (e) {
    console.error("instagram: criação", postId, e);
    await mudar(db, postId, { situacao: "erro", erro: mensagem(e) });
  }
}

export async function processarEnvio(db: BancoDeDados, empresaId: string, postId: string, agora: boolean) {
  const [post] = await db.select().from(postsInstagram).where(and(eq(postsInstagram.id, postId), eq(postsInstagram.empresaId, empresaId)));
  const conta = await contaDaEmpresa(db, empresaId);
  if (!post?.conteudo || !conta) return;
  try {
    const id = await publicarNoBuffer(decifrar(conta.bufferTokenCifrado), conta.canalId, {
      legenda: post.conteudo.legenda,
      arteUrl: arteDoPost(postId),
      alt: post.conteudo.textoAlternativo,
      agora,
    });
    await mudar(db, postId, { situacao: "enviado", bufferPostId: id, erro: null });
  } catch (e) {
    console.error("instagram: envio", postId, e);
    await mudar(db, postId, { situacao: "erro", erro: mensagem(e) });
  }
}
