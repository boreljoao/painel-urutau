import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { BancoDeDados } from "@/db";
import {
  type ArquivoPostInstagram,
  type ConteudoPostInstagram,
  type FormatoPostInstagram,
  type MetricasPostInstagram,
  contasInstagram,
  empresas,
  postsInstagram,
} from "@/db/schema";
import { analisar } from "@/lib/instagram/analise";
import { pacoteDe } from "@/pacotes/catalogo";
import { type CriarMensagem, ErroAtendimento, comSubstituto, criarPadrao } from "@/lib/servidor/atendimento";
import { cifrar, decifrar } from "@/lib/servidor/segredos";

/**
 * Instagram no painel: a IA escreve o post (olhando as fotos e PDFs enviados), o painel confere
 * e envia pelo Buffer da empresa (agora, na fila ou em data marcada). Cada etapa grava a situação
 * no banco, então o celular e o notebook abertos na mesma empresa veem o post andar juntos. Depois
 * de enviado, o painel pergunta ao Buffer se saiu e quantas pessoas viram.
 */

export const MODELO_INSTAGRAM = "claude-opus-5-5";
const BUFFER = "https://api.buffer.com";

export class ErroInstagram extends Error {}

export const OBJETIVOS = [
  "Gerar contatos no WhatsApp",
  "Vender um produto ou serviço",
  "Mostrar bastidores",
  "Ensinar algo útil",
  "Dar uma opinião forte",
  "Anunciar novidade ou promoção",
] as const;

// ─── Geração ─────────────────────────────────────────────────────────────────

const esquema = z.object({
  gancho: z.string().describe("Primeira frase do post, 5 a 12 palavras, com algo concreto e algo em jogo."),
  legenda: z.string().describe("Legenda completa em português do Brasil, sem hashtags."),
  hashtags: z.array(z.string()).describe("De 3 a 5 hashtags, sem o #."),
  arte: z.object({
    titulo: z.string().describe("Título da arte de capa, no máximo 6 palavras."),
    subtitulo: z.string().describe("Apoio do título, no máximo 14 palavras."),
    selo: z.string().describe("Etiqueta curta no topo da arte, 1 a 3 palavras."),
  }),
  slides: z.array(z.string()).describe("Para carrossel: um texto curto (até 12 palavras) por slide depois da capa. Para outros formatos, lista vazia."),
  roteiroReel: z.array(z.string()).describe("Roteiro falado de um Reel de 20 a 30 segundos, uma fala por item, de 5 a 8 falas."),
  textoAlternativo: z.string().describe("Descrição da imagem principal para acessibilidade."),
});

const SISTEMA = `Você escreve posts de Instagram para pequenas empresas brasileiras, no jeito de falar de quem é dono do negócio.

Regras:
- Português do Brasil, frases curtas, sem travessão, sem clichê de marketing (alavancar, potencializar, jornada, ecossistema, revolucionário, no cenário atual).
- O gancho abre a legenda e tem de funcionar sozinho no feed: começa pelo fato, sem saudação e sem "neste post".
- Nunca invente números, preços, clientes, prêmios ou resultados. Use só fatos do pedido, das fotos e dos documentos. Sem um número real, escreva sem número.
- Se houver fotos, descreva o que realmente aparece nelas. Se houver ficha técnica, use os dados dela.
- Uma única chamada para ação no fim, ligada ao objetivo (ex.: "Me chama no direct", "Comente EU QUERO").
- Hashtags em português, específicas do ramo e da cidade quando houver.
- Carrossel: o slide de capa usa o título da arte; os slides seguintes contam uma ideia cada.`;

const NOME_FORMATO: Record<FormatoPostInstagram, string> = { post: "post de uma imagem", carrossel: "carrossel", reel: "Reel (vídeo)", story: "story" };

export interface PedidoPost {
  tema: string;
  objetivo: string | null;
  orientacoes: string | null;
  formato: FormatoPostInstagram;
  arquivos: ArquivoPostInstagram[];
}

export async function gerarConteudo(
  empresa: { nome: string; ramo: string; cidade: string | null },
  pedido: PedidoPost,
  criar: CriarMensagem = criarPadrao,
): Promise<ConteudoPostInstagram> {
  const fotos = pedido.arquivos.filter((a) => a.tipo === "imagem").slice(0, 10);
  const pdfs = pedido.arquivos.filter((a) => a.tipo === "documento").slice(0, 3);
  const outros = pedido.arquivos.filter((a) => a.tipo === "video" || a.tipo === "link");
  const texto = [
    `Empresa: ${empresa.nome}`,
    `Ramo: ${empresa.ramo}`,
    empresa.cidade ? `Cidade: ${empresa.cidade}` : null,
    `Formato: ${NOME_FORMATO[pedido.formato]}`,
    `Assunto do post: ${pedido.tema}`,
    pedido.objetivo ? `Objetivo: ${pedido.objetivo}` : null,
    pedido.orientacoes ? `Orientações do dono: ${pedido.orientacoes}` : null,
    fotos.length ? `Fotos enviadas (na ordem do carrossel): ${fotos.length}` : "Sem fotos: a capa será uma arte com o título.",
    outros.length ? `Outros materiais: ${outros.map((o) => `${o.tipo} "${o.nome}"`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const conteudo: BetaContentBlockParam[] = [
    ...pdfs.map((d) => ({ type: "document" as const, source: { type: "url" as const, url: d.url } })),
    ...fotos.map((f) => ({ type: "image" as const, source: { type: "url" as const, url: f.url } })),
    { type: "text", text: texto },
  ];
  const r = await criar({
    model: MODELO_INSTAGRAM,
    max_tokens: 6000,
    system: SISTEMA,
    messages: [{ role: "user", content: conteudo }],
    output_config: { effort: "low", format: zodOutputFormat(esquema) },
    ...comSubstituto(MODELO_INSTAGRAM),
  });
  if (r.stop_reason === "refusal") throw new ErroInstagram("A IA não quis escrever sobre esse assunto. Tente outro tema.");
  const bruto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const lido = esquema.safeParse(JSON.parse(bruto || "{}"));
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
  const { account } = await chamarBuffer<{ account: { organizations: { id: string }[] } }>(token, "query { account { organizations { id } } }");
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

export type Quando = { tipo: "agora" } | { tipo: "fila" } | { tipo: "data"; em: Date };

interface Envio {
  legenda: string;
  formato: FormatoPostInstagram;
  imagens: { url: string; alt: string }[];
  video: string | null;
  quando: Quando;
}

/** Monta o createPost do Buffer. Separada para dar para testar sem rede. */
export function mutacaoCreatePost(canalId: string, e: Envio) {
  const assets =
    e.formato === "reel" || (e.formato === "story" && e.video)
      ? `[{ video: { url: ${textoGraphql(e.video ?? "")}, metadata: { thumbnailOffset: 1000 } } }]`
      : `[${e.imagens.map((i) => `{ image: { url: ${textoGraphql(i.url)}, metadata: { altText: ${textoGraphql(i.alt)} } } }`).join(", ")}]`;
  const tipo = e.formato === "reel" ? "reel" : e.formato === "story" ? "story" : "post";
  const modo = e.quando.tipo === "agora" ? "shareNow" : e.quando.tipo === "fila" ? "addToQueue" : "customScheduled";
  const dueAt = e.quando.tipo === "data" ? `\n      dueAt: ${textoGraphql(e.quando.em.toISOString())}` : "";
  return `mutation {
    createPost(input: {
      text: ${textoGraphql(e.legenda)}
      channelId: ${textoGraphql(canalId)}
      schedulingType: automatic
      mode: ${modo}${dueAt}
      assets: ${assets}
      metadata: { instagram: { type: ${tipo}, shouldShareToFeed: ${e.formato !== "story"} } }
    }) {
      ... on PostActionSuccess { post { id } }
      ... on MutationError { message }
    }
  }`;
}

async function publicarNoBuffer(token: string, canalId: string, e: Envio) {
  const { createPost } = await chamarBuffer<{ createPost: { post?: { id: string }; message?: string } }>(token, mutacaoCreatePost(canalId, e));
  if (!createPost.post) throw new ErroInstagram(`Buffer: ${createPost.message ?? "não aceitou o post"}`);
  return createPost.post.id;
}

interface PostDoBuffer {
  id: string;
  status: string;
  sentAt: string | null;
  externalLink: string | null;
  metrics: { type: string; name: string; value: number | null }[] | null;
}

async function lerPostDoBuffer(token: string, id: string) {
  const { post } = await chamarBuffer<{ post: PostDoBuffer }>(
    token,
    `query { post(input: { id: ${textoGraphql(id)} }) { id status sentAt externalLink metrics { type name value } } }`,
  );
  return post;
}

/** Traduz a lista de métricas do Buffer (nomes variam por rede) para os números do painel. */
export function metricasDe(lista: PostDoBuffer["metrics"]): MetricasPostInstagram {
  const m: MetricasPostInstagram = { visualizacoes: null, alcance: null, curtidas: null, comentarios: null, salvos: null, compartilhamentos: null };
  for (const { type, name, value } of lista ?? []) {
    if (value == null) continue;
    const k = `${type} ${name}`.toLowerCase();
    if (/reach|alcance/.test(k)) m.alcance = value;
    else if (/view|play|impression/.test(k)) m.visualizacoes = Math.max(m.visualizacoes ?? 0, value);
    else if (/like|reaction/.test(k)) m.curtidas = value;
    else if (/comment/.test(k)) m.comentarios = value;
    else if (/save/.test(k)) m.salvos = value;
    else if (/share/.test(k)) m.compartilhamentos = value;
  }
  return m;
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

/** Capa (n = 0) e slides do carrossel gerados pelo painel. */
export const arteDoPost = (postId: string, n = 0) => `${urlPublica()}/arte/${postId}${n ? `-${n}` : ""}.png`;

export async function listarPosts(db: BancoDeDados, empresaId: string, limite = 200) {
  return db.select().from(postsInstagram).where(eq(postsInstagram.empresaId, empresaId)).orderBy(desc(postsInstagram.criadoEm)).limit(limite);
}

export type PostInstagram = Awaited<ReturnType<typeof listarPosts>>[number];

export async function postDaEmpresa(db: BancoDeDados, empresaId: string, postId: string) {
  const [p] = await db.select().from(postsInstagram).where(and(eq(postsInstagram.id, postId), eq(postsInstagram.empresaId, empresaId)));
  return p ?? null;
}

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

export interface DadosPost extends PedidoPost {
  modo: "revisar" | "automatico";
  agendadoPara: Date | null;
}

/** Cria ou atualiza o rascunho do assistente "Novo post". */
export async function salvarRascunho(db: BancoDeDados, empresaId: string, usuarioId: string, dados: DadosPost, postId?: string) {
  const campos = {
    tema: dados.tema,
    objetivo: dados.objetivo,
    orientacoes: dados.orientacoes,
    formato: dados.formato,
    arquivos: dados.arquivos,
    modo: dados.modo,
    agendadoPara: dados.agendadoPara,
  };
  if (postId) {
    const [p] = await db
      .update(postsInstagram)
      .set({ ...campos, atualizadoEm: new Date() })
      .where(and(eq(postsInstagram.id, postId), eq(postsInstagram.empresaId, empresaId)))
      .returning({ id: postsInstagram.id });
    if (p) return p.id;
  }
  const [p] = await db.insert(postsInstagram).values({ empresaId, criadoPor: usuarioId, situacao: "rascunho", ...campos }).returning({ id: postsInstagram.id });
  return p.id;
}

/** Criar → analisar → pronto (e, no modo automático, já envia). Roda depois da resposta. */
export async function processarCriacao(db: BancoDeDados, postId: string, criar?: CriarMensagem) {
  const [linha] = await db
    .select({ post: postsInstagram, nome: empresas.nome, perfil: empresas.perfil, cidade: empresas.cidade })
    .from(postsInstagram)
    .innerJoin(empresas, eq(empresas.id, postsInstagram.empresaId))
    .where(eq(postsInstagram.id, postId));
  if (!linha) return;
  const { post } = linha;
  try {
    const bruto = await gerarConteudo({ nome: linha.nome, ramo: pacoteDe(linha.perfil).nome, cidade: linha.cidade }, post, criar);
    await mudar(db, postId, { situacao: "analisando", conteudo: bruto });
    const { conteudo, analise } = analisar(bruto);
    await new Promise((r) => setTimeout(r, 1200));
    await mudar(db, postId, { situacao: "pronto", conteudo, analise });
    if (post.modo === "automatico" && (await contaDaEmpresa(db, post.empresaId))) {
      const quando: Quando = post.agendadoPara && post.agendadoPara > new Date() ? { tipo: "data", em: post.agendadoPara } : { tipo: "fila" };
      await mudar(db, postId, { situacao: "enviando", envio: quando.tipo });
      await processarEnvio(db, post.empresaId, postId, quando);
    }
  } catch (e) {
    console.error("instagram: criação", postId, e);
    await mudar(db, postId, { situacao: "erro", erro: mensagem(e) });
  }
}

/** O que dá para mandar ao Buffer conforme o formato e os materiais. */
export function materiaisDoEnvio(post: Pick<PostInstagram, "id" | "formato" | "arquivos" | "conteudo">) {
  const fotos = post.arquivos.filter((a) => a.tipo === "imagem");
  const video = post.arquivos.find((a) => a.tipo === "video")?.url ?? null;
  const alt = post.conteudo?.textoAlternativo ?? "";
  if (post.formato === "reel") {
    if (!video) throw new ErroInstagram("Reel precisa de um vídeo. Envie o vídeo nos materiais.");
    return { imagens: [], video };
  }
  if (post.formato === "carrossel") {
    const imagens = fotos.length >= 2 ? fotos.slice(0, 10).map((f) => ({ url: f.url, alt })) : [
      { url: arteDoPost(post.id), alt },
      ...(post.conteudo?.slides ?? []).slice(0, 9).map((_, i) => ({ url: arteDoPost(post.id, i + 1), alt })),
    ];
    if (imagens.length < 2) throw new ErroInstagram("Carrossel precisa de pelo menos 2 imagens.");
    return { imagens, video: null };
  }
  if (post.formato === "story" && video) return { imagens: [], video };
  return { imagens: [{ url: fotos[0]?.url ?? arteDoPost(post.id), alt }], video: null };
}

export async function processarEnvio(db: BancoDeDados, empresaId: string, postId: string, quando: Quando) {
  const post = await postDaEmpresa(db, empresaId, postId);
  const conta = await contaDaEmpresa(db, empresaId);
  if (!post?.conteudo || !conta) return;
  try {
    const id = await publicarNoBuffer(decifrar(conta.bufferTokenCifrado), conta.canalId, {
      legenda: post.conteudo.legenda,
      formato: post.formato,
      ...materiaisDoEnvio(post),
      quando,
    });
    await mudar(db, postId, {
      situacao: quando.tipo === "agora" ? "enviado" : "agendado",
      agendadoPara: quando.tipo === "data" ? quando.em : post.agendadoPara,
      bufferPostId: id,
      erro: null,
    });
  } catch (e) {
    console.error("instagram: envio", postId, e);
    await mudar(db, postId, { situacao: "erro", erro: mensagem(e) });
  }
}

const ultimaSincronia = new Map<string, number>();

/** Pergunta ao Buffer se os posts enviados já saíram e atualiza os números dos publicados. */
export async function sincronizar(db: BancoDeDados, empresaId: string) {
  const agora = Date.now();
  if (agora - (ultimaSincronia.get(empresaId) ?? 0) < 45_000) return;
  ultimaSincronia.set(empresaId, agora);
  const conta = await contaDaEmpresa(db, empresaId);
  if (!conta) return;
  const token = decifrar(conta.bufferTokenCifrado);
  const pendentes = await db
    .select()
    .from(postsInstagram)
    .where(and(eq(postsInstagram.empresaId, empresaId), isNotNull(postsInstagram.bufferPostId), inArray(postsInstagram.situacao, ["enviado", "agendado", "publicado"])))
    .orderBy(desc(postsInstagram.atualizadoEm))
    .limit(40);
  const seisHoras = 6 * 3600_000;
  const trintaDias = 30 * 24 * 3600_000;
  const fila = pendentes
    .filter(
      (p) =>
        p.situacao !== "publicado" ||
        (p.publicadoEm && agora - p.publicadoEm.getTime() < trintaDias && (!p.metricasEm || agora - p.metricasEm.getTime() > seisHoras)),
    )
    .slice(0, 8);
  for (const p of fila) {
    try {
      const b = await lerPostDoBuffer(token, p.bufferPostId!);
      const status = b.status.toLowerCase();
      if (status === "sent") {
        await mudar(db, p.id, {
          situacao: "publicado",
          publicadoEm: b.sentAt ? new Date(b.sentAt) : (p.publicadoEm ?? new Date()),
          linkInstagram: b.externalLink,
          metricas: metricasDe(b.metrics),
          metricasEm: new Date(),
        });
      } else if (status === "error") {
        await mudar(db, p.id, { situacao: "erro", erro: "O Instagram recusou o post no Buffer. Veja o motivo no Buffer e tente de novo." });
      }
    } catch (e) {
      console.error("instagram: sincronia", p.id, e);
    }
  }
}

// ─── Planejar a semana ───────────────────────────────────────────────────────

const esquemaPlano = z.object({
  posts: z
    .array(
      z.object({
        dia: z.string().describe("Data no formato AAAA-MM-DD, dentro dos próximos 7 dias."),
        hora: z.string().describe("Hora no formato HH:MM, horário de Brasília."),
        formato: z.enum(["post", "carrossel", "reel"]),
        objetivo: z.string(),
        tema: z.string().describe("O ângulo do post em uma frase concreta, não só o assunto."),
      }),
    )
    .describe("De 4 a 5 posts, nunca dois do mesmo formato seguidos."),
});

/** A IA monta a semana (temas, formatos e horários) e cada post entra na fila de criação. */
export async function planejarSemana(
  db: BancoDeDados,
  empresaId: string,
  usuarioId: string,
  contexto: string,
  hoje: string,
  criar: CriarMensagem = criarPadrao,
) {
  const [e] = await db.select().from(empresas).where(eq(empresas.id, empresaId));
  if (!e) throw new ErroInstagram("Empresa não encontrada.");
  const r = await criar({
    model: MODELO_INSTAGRAM,
    max_tokens: 4000,
    system:
      "Você planeja a semana de Instagram de pequenas empresas brasileiras. Pelo menos 2 Reels por semana. Horários: público de empresas, cedo (7h às 9h); público consumidor, fim da tarde (18h às 20h). Temas concretos, ligados ao que aconteceu no negócio. Nunca invente números.",
    messages: [
      {
        role: "user",
        content: `Empresa: ${e.nome}\nRamo: ${pacoteDe(e.perfil).nome}\n${e.cidade ? `Cidade: ${e.cidade}\n` : ""}Hoje: ${hoje}\nO que aconteceu e o que o dono quer destacar: ${contexto || "(nada informado: use temas úteis do ramo)"}`,
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(esquemaPlano) },
    ...comSubstituto(MODELO_INSTAGRAM),
  });
  const bruto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const plano = esquemaPlano.safeParse(JSON.parse(bruto || "{}"));
  if (!plano.success) throw new ErroInstagram("A IA respondeu fora do formato. Tente de novo.");
  const ids: string[] = [];
  for (const p of plano.data.posts.slice(0, 5)) {
    const em = new Date(`${p.dia}T${p.hora}:00-03:00`);
    const [novo] = await db
      .insert(postsInstagram)
      .values({ empresaId, criadoPor: usuarioId, tema: p.tema, objetivo: p.objetivo, formato: p.formato, agendadoPara: Number.isNaN(em.getTime()) ? null : em, situacao: "criando" })
      .returning({ id: postsInstagram.id });
    ids.push(novo.id);
  }
  return ids;
}
