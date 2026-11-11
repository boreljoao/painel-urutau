// Copia do app-urutau o banco (schema) e as bibliotecas de cálculo para cá.
// O app-urutau é a fonte: é ele que cria e migra as tabelas. Rode depois de mudar o schema lá.
//
// Este repositório é público. Só vem para cá o que o painel usa: as partes comerciais da Urutau
// (chat do site, CRM, Central da equipe, textos de demonstração) ficam no app e nunca são copiadas.
//
// Segurança da cópia:
// - Nada que só existe no painel é apagado (src/lib/demo.ts, src/lib/instagram/…).
// - scripts/sincronizado.json guarda o conteúdo de cada arquivo na última cópia. Se alguém mexeu
//   num desses arquivos aqui no painel, a cópia para e lista quais: a correção tem de ir para o
//   app-urutau primeiro (senão a próxima cópia a desfaz). `--forcar` copia mesmo assim.
// - `--conferir` só mostra o que mudaria, sem gravar.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const origem = resolve(import.meta.dirname, "../../app-urutau/src");
const destino = resolve(import.meta.dirname, "../src");
const manifesto = resolve(import.meta.dirname, "sincronizado.json");
const forcar = process.argv.includes("--forcar");
const conferir = process.argv.includes("--conferir");
if (!existsSync(origem)) throw new Error(`Não achei o app-urutau em ${origem}`);

// Caminhos (dentro de src/) que o painel não usa e que não podem ficar num repositório público.
const SEM_USO = [
  "lib/relatorios", // PDFs: precisam do @react-pdf e ficam no app
  // db/padroes.ts vem junto: o painel cria empresas com as categorias e fontes padrão.
  "lib/calculos/provisoes.ts",
  "lib/receita.ts",
  "lib/textos-folha.ts",
  "lib/central.ts",
  "lib/chat-site.ts", // no lugar vai scripts/pecas/chat-site.ts, só com os tipos
  "lib/comercial.ts",
  ...[
    "acoes-admin", "acoes-ajustes", "acoes-assistente", "acoes-central", "acoes-chat-site", "acoes-clientes",
    "acoes-comercial", "acoes-conferencia", "acoes-conta", "acoes-estoque", "acoes-fase4", "acoes-receita", "admin", "assistente",
    "central", "chat-site", "comercial", "cron", "demonstracao-chat", "demonstracao", "empresas",
    "formularios-receita", "lembretes-agenda", "receita", "relatorio", "site-origem", "visitantes",
  ].map((n) => `lib/servidor/${n}.ts`),
];

const usado = (rel) => !SEM_USO.some((s) => rel === s || rel.startsWith(`${s}/`));
// Compara sem ligar para fim de linha (o Windows grava CRLF em alguns arquivos).
const hash = (arquivo) => createHash("sha256").update(readFileSync(arquivo, "utf8").replace(/\r\n/g, "\n")).digest("hex");

function arquivos(pasta) {
  const lista = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = resolve(pasta, nome);
    if (statSync(caminho).isDirectory()) lista.push(...arquivos(caminho));
    else lista.push(caminho);
  }
  return lista;
}

const copias = new Map(); // rel → origem absoluta
for (const pasta of ["db", "lib"])
  for (const f of arquivos(resolve(origem, pasta))) {
    const rel = relative(origem, f).split(sep).join("/");
    if (usado(rel)) copias.set(rel, f);
  }
copias.set("lib/chat-site.ts", resolve(import.meta.dirname, "pecas/chat-site.ts"));

const anterior = existsSync(manifesto) ? JSON.parse(readFileSync(manifesto, "utf8")) : {};
const mexidosAqui = [];
const mudam = [];
for (const [rel, de] of copias) {
  const para = resolve(destino, rel);
  if (!existsSync(para)) {
    mudam.push(`+ ${rel}`);
    continue;
  }
  const atual = hash(para);
  if (atual === hash(de)) continue;
  mudam.push(`~ ${rel}`);
  // Mudou aqui desde a última cópia (ou nunca houve manifesto e o arquivo difere do app).
  if (anterior[rel] ? anterior[rel] !== atual : Object.keys(anterior).length > 0) mexidosAqui.push(rel);
}

if (conferir) {
  console.log(mudam.length ? `Mudariam ${mudam.length} arquivos:\n${mudam.join("\n")}` : "Nada para copiar: o painel está igual ao app.");
  if (mexidosAqui.length) console.log(`\nMexidos aqui no painel desde a última cópia:\n${mexidosAqui.join("\n")}`);
  process.exit(0);
}
if (mexidosAqui.length && !forcar) {
  console.error(
    `Parei: estes arquivos foram mexidos aqui no painel desde a última cópia e seriam sobrescritos:\n${mexidosAqui.join("\n")}\n\n` +
      "Leve a mudança para o app-urutau (que é a fonte) e rode de novo, ou use --forcar para descartar.",
  );
  process.exit(1);
}

const novo = {};
for (const [rel, de] of copias) {
  const para = resolve(destino, rel);
  mkdirSync(dirname(para), { recursive: true });
  cpSync(de, para);
  novo[rel] = hash(para);
}
writeFileSync(manifesto, `${JSON.stringify(Object.fromEntries(Object.entries(novo).sort()), null, 1)}\n`);
console.log(`Copiado: ${mudam.length} arquivos de src/db e src/lib do app-urutau (sem as partes comerciais). Nada do painel foi apagado.`);
