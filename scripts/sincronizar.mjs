// Copia do app-urutau o banco (schema) e as bibliotecas de cálculo para cá.
// O app-urutau é a fonte: é ele que cria e migra as tabelas. Rode depois de mudar o schema lá.
//
// Este repositório é público. Só vem para cá o que o painel usa: as partes comerciais da Urutau
// (chat do site, CRM, Central da equipe, textos de demonstração) ficam no app e nunca são copiadas.
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const origem = resolve(import.meta.dirname, "../../app-urutau/src");
const destino = resolve(import.meta.dirname, "../src");
if (!existsSync(origem)) throw new Error(`Não achei o app-urutau em ${origem}`);

// Caminhos (dentro de src/) que o painel não usa e que não podem ficar num repositório público.
const SEM_USO = [
  "lib/relatorios", // PDFs: precisam do @react-pdf e ficam no app
  "db/padroes.ts",
  "lib/calculos/provisoes.ts",
  "lib/receita.ts",
  "lib/textos-folha.ts",
  "lib/central.ts",
  "lib/chat-site.ts", // no lugar vai scripts/pecas/chat-site.ts, só com os tipos
  "lib/comercial.ts",
  ...[
    "acoes-admin", "acoes-ajustes", "acoes-assistente", "acoes-central", "acoes-chat-site", "acoes-clientes",
    "acoes-comercial", "acoes-conferencia", "acoes-conta", "acoes-fase4", "acoes-receita", "admin", "assistente",
    "central", "chat-site", "comercial", "cron", "demonstracao-chat", "demonstracao", "empresas",
    "formularios-receita", "receita", "relatorio", "site-origem", "visitantes",
  ].map((n) => `lib/servidor/${n}.ts`),
];

for (const pasta of ["db", "lib"]) {
  rmSync(resolve(destino, pasta), { recursive: true, force: true });
  cpSync(resolve(origem, pasta), resolve(destino, pasta), {
    recursive: true,
    filter: (f) => {
      const rel = f.split(sep).join("/");
      return !SEM_USO.some((s) => rel.endsWith(`/src/${s}`) || rel.includes(`/src/${s}/`));
    },
  });
}
cpSync(resolve(import.meta.dirname, "pecas/chat-site.ts"), resolve(destino, "lib/chat-site.ts"));
console.log("Copiado: src/db e src/lib do app-urutau (sem as partes comerciais).");
