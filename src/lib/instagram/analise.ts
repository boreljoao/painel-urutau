/**
 * Conferência de um post antes de sair: nota do gancho (cinco propriedades que ganchos
 * fortes têm em comum), checagens da legenda e limpeza de clichês e marcas de texto de IA.
 * Portado das ferramentas pt-BR do projeto urutau-instagram. A nota elimina ganchos fracos;
 * ela não prevê viralização.
 */
import type { AnalisePostInstagram, ConteudoPostInstagram } from "@/db/schema";
import lexico from "./lexico.json";

const PALAVRA = /R\$\s?\d+|[A-Za-zÀ-ÿ0-9$%'’-]+/g;
const NUMERO = /R?\$\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:%|k\b|x\b|h\b|horas?\b|min\b|minutos?\b|dias?\b|semanas?\b|mês\b|meses\b|anos?\b)?/gi;
const NOME_PROPRIO = /(?<!^)\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b/g;
const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
const EMOJI = /\p{Extended_Pictographic}/u;

const NUMEROS_FALADOS = new Set(
  "zero dois duas três quatro cinco seis sete oito nove dez onze doze treze quatorze catorze quinze dezesseis dezessete dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa cem cento duzentos trezentos mil milhão milhões bilhão dúzia metade meia dobro triplo".split(" "),
);
const DINHEIRO = new Set("reais real centavos conto contos faturamento lucro salário aluguel boleto prejuízo receita".split(" "));
const TENSAO = new Set(
  "pare para nunca errado errada erro erros errei perdi perdeu perde perder perdemos custou custa quebrou faliu ninguém não sem demitido cancelou cancelaram desisti pior odeio mentira verdade segredo antes depois até só ainda já problema risco perigo cuidado arrependi deveria contra viraram virou golpe desperdício fora proibido".split(" "),
);
const ABERTURAS_FRACAS = [
  "olá", "oi", "e aí", "galera", "gente", "pessoal", "bem-vindo", "bem-vindos", "hoje", "então", "bom", "boa",
  "neste", "nesse", "vamos", "queria", "quero", "você sabia", "tudo bem", "basicamente", "olha", "tipo", "eu queria",
  "eu quero", "este é", "esse é", "isso é", "uma das", "um dos", "existe", "existem",
];
const IMPERATIVOS = new Set("pare para copie apague tente veja salve use faça escreva mande comece nunca sempre não".split(" "));
const PRIMEIRA_PESSOA = new Set("perdi fiz errei ganhei fechei paguei tive vendi gastei quebrei demiti contratei cancelei aprendi descobri fechamos perdemos ganhamos erramos vendemos fizemos".split(" "));

const ELIMINATORIAS: [RegExp, string][] = [
  [/^\s*(?:pare de rolar|para de rolar|não role)/i, "Abre pedindo atenção (“pare de rolar”)."],
  [/\b(?:neste|nesse|no) (?:vídeo|reel)\b|\bvou (?:te )?(?:mostrar|ensinar)\b|\bmais um vídeo\b/i, "Preâmbulo de vídeo: abra direto no resultado."],
  [/^\s*(?:olá|oi|e aí|fala (?:galera|pessoal|gente)|bom dia|boa tarde|boa noite|bem-vind[oa]s?)(?![\p{L}])/iu, "Saudação: ninguém abriu o feed para ser cumprimentado."],
  [/^\s*hoje (?:eu )?(?:vou|vamos|quero|queria)\b/i, "Anuncia o tema em vez de começar pelo que aconteceu."],
  [HASHTAG, "Hashtag no gancho."],
  [EMOJI, "Emoji no gancho."],
];

const limitar = (n: number) => Math.max(0, Math.min(100, n));
const palavras = (texto: string) => texto.replace(/(?<=\d)[.,](?=\d)/g, "").match(PALAVRA) ?? [];
const minusculas = (texto: string) => palavras(texto).map((p) => p.toLowerCase().replace(/['’]/g, ""));

function comprimento(texto: string) {
  const n = palavras(texto).length;
  let nota = n >= 5 && n <= 12 ? 100 : n < 5 ? 100 - (5 - n) * 20 : 100 - (n - 12) * 11;
  if (texto.trim().length > 60) nota -= 12;
  return { nome: "Tamanho", nota: limitar(nota), detalhe: `${n} palavras, ~${(n / 2.75).toFixed(1)}s falado (ideal: 5 a 12)` };
}

function concretude(texto: string) {
  const baixas = minusculas(texto);
  const acertos =
    (texto.match(NUMERO)?.filter((m) => m.trim()).length ?? 0) +
    new Set(texto.match(NOME_PROPRIO) ?? []).size +
    baixas.filter((p) => NUMEROS_FALADOS.has(p) || DINHEIRO.has(p)).length;
  return { nome: "Algo concreto", nota: acertos ? limitar(45 + acertos * 30) : 15, detalhe: acertos ? `${acertos} número(s) ou nome(s)` : "sem número, nome ou fato que dê para conferir" };
}

function tensao(texto: string) {
  const marcas = new Set(minusculas(texto).filter((p) => TENSAO.has(p)));
  if (/\$\s?\d/.test(texto)) marcas.add("um valor");
  const n = marcas.size;
  return { nome: "O que está em jogo", nota: n === 0 ? 20 : n === 1 ? 70 : 100, detalhe: n ? [...marcas].slice(0, 4).join(", ") : "nada em jogo na frase" };
}

function frente(texto: string) {
  const ps = palavras(texto);
  const baixas = minusculas(texto);
  if (!ps.length) return { nome: "Começo forte", nota: 0, detalhe: "vazio" };
  const abertura = baixas.slice(0, 2).join(" ");
  const fraca = ABERTURAS_FRACAS.find((f) => abertura === f || abertura.startsWith(`${f} `) || baixas[0] === f);
  const i = baixas.findIndex(
    (p, k) => TENSAO.has(p) || NUMEROS_FALADOS.has(p) || DINHEIRO.has(p) || /^R?\$|^\d/.test(ps[k]) || (k > 0 && /^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(ps[k])),
  );
  const base = i < 0 ? 30 : i <= 3 ? 100 : i <= 6 ? 70 : 40;
  const onde = i < 0 ? "o ponto principal não aparece" : `o ponto principal está na palavra ${i + 1}`;
  return { nome: "Começo forte", nota: limitar(base - (fraca ? 30 : 0)), detalhe: fraca ? `${onde}; abre com “${fraca}”` : onde };
}

function conversa(texto: string) {
  const baixo = texto.toLowerCase();
  const ps = minusculas(texto);
  if (/(?<![\p{L}])(você|vocês|cê|te|teu|tua|seu|sua|seus|suas)(?![\p{L}])/u.test(baixo)) return { nome: "Fala com alguém", nota: 100, detalhe: "fala direto com quem assiste" };
  if (IMPERATIVOS.has(ps[0])) return { nome: "Fala com alguém", nota: 90, detalhe: `começa com uma ordem (“${ps[0]}”)` };
  if (/(?<![\p{L}])(eu|meu|minha|me|nós|nosso|nossa|a gente)(?![\p{L}])/u.test(baixo) || ps.some((p) => PRIMEIRA_PESSOA.has(p)))
    return { nome: "Fala com alguém", nota: 70, detalhe: "primeira pessoa" };
  return { nome: "Fala com alguém", nota: 35, detalhe: "terceira pessoa, ninguém na conversa" };
}

export function notaDoGancho(gancho: string) {
  const pontos = [comprimento(gancho), concretude(gancho), tensao(gancho), frente(gancho), conversa(gancho)];
  const alertas = ELIMINATORIAS.filter(([r]) => r.test(gancho)).map(([, msg]) => msg);
  const notas = pontos.map((p) => p.nota);
  const media = notas.reduce((a, b) => a + b, 0) / notas.length;
  const nota = Math.round(limitar(media * 0.6 + Math.min(...notas) * 0.4 - alertas.length * 15));
  return { nota, pontos, alertas };
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+").replace(/ /g, "\\s+");

/** Troca clichês por palavras simples e tira travessões e caracteres invisíveis. */
export function limpar(texto: string) {
  const trocas: { de: string; para: string }[] = [];
  let t = texto.replace(/[\u200B-\u200F\u2060-\u2064\uFEFF]/g, "");
  if (t.includes("—")) trocas.push({ de: "—", para: "," });
  t = t.replace(/\s*—\s*/g, ", ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...");
  for (const { de, para } of lexico.termos) {
    const re = new RegExp(`(?<![\\p{L}])${escapar(de)}(?![\\p{L}])`, "giu");
    if (!re.test(t)) continue;
    trocas.push({ de, para: para || "(removido)" });
    t = t.replace(re, (achado) => (para && achado[0] === achado[0].toUpperCase() ? para[0].toUpperCase() + para.slice(1) : para));
  }
  t = t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(?<=^|\n)[ \t]*[,.;:]+[ \t]*/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/(^|[.!?]\s+|\n)([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());
  return { texto: t.trim(), trocas };
}

const CHAMADAS: [RegExp, string][] = [
  [/(?:comente|comenta)\s+(?:a palavra\s+)?"?[A-ZÀ-Ý0-9]{2,}/i, "comentar palavra"],
  [/\b(?:me chama|me chame|me manda|manda (?:um )?direct|chama no direct)\b/i, "chamar no direct"],
  [/\b(?:salve|salva) (?:esse|este|o) (?:post|vídeo|reel|carrossel)\b/i, "salvar"],
  [/\b(?:compartilhe|compartilha|manda (?:pra|para) (?:alguém|quem))\b/i, "compartilhar"],
  [/\blink na bio\b/i, "link na bio"],
  [/\bme conta\b|\bqual (?:você|vc)\b|\bo que você (?:acha|faria)\b/i, "responder"],
];

export const FEED_VISIVEL = 125;

export function analisar(conteudo: ConteudoPostInstagram): { conteudo: ConteudoPostInstagram; analise: AnalisePostInstagram } {
  const legendaLimpa = limpar(conteudo.legenda);
  const ganchoLimpo = limpar(conteudo.gancho);
  const hashtags = [...new Set(conteudo.hashtags.map((h) => `#${h.replace(/^#/, "").replace(/\s+/g, "")}`))].slice(0, 5);
  const corpo = legendaLimpa.texto.replace(HASHTAG, "").trim();
  const legenda = hashtags.length ? `${corpo}\n\n${hashtags.join(" ")}` : corpo;
  const gancho = notaDoGancho(ganchoLimpo.texto);
  const visivel = legenda.slice(0, FEED_VISIVEL);
  const chamadas = CHAMADAS.filter(([r]) => r.test(corpo)).map(([, n]) => n);
  const concretoNoFeed = concretude(visivel).nota > 15;

  const checagens: AnalisePostInstagram["checagens"] = [
    { nome: "Começo da legenda", status: concretoNoFeed ? "ok" : "atencao", detalhe: concretoNoFeed ? "tem algo concreto antes do “mais”" : "nada concreto nas primeiras 125 letras" },
    { nome: "Chamada para ação", status: chamadas.length === 1 ? "ok" : "atencao", detalhe: chamadas.length === 1 ? chamadas[0] : chamadas.length ? `${chamadas.length} pedidos: fique com um` : "não pede nada a quem lê" },
    { nome: "Hashtags", status: hashtags.length <= 5 ? "ok" : "atencao", detalhe: `${hashtags.length} de no máximo 5` },
    { nome: "Tamanho", status: legenda.length <= 2200 ? "ok" : "atencao", detalhe: `${legenda.length} de 2.200 caracteres` },
    { nome: "Texto com cara de IA", status: legendaLimpa.trocas.length ? "atencao" : "ok", detalhe: legendaLimpa.trocas.length ? `${legendaLimpa.trocas.length} trecho(s) trocados` : "nada a trocar" },
  ];
  const atencoes = checagens.filter((c) => c.status === "atencao" && c.nome !== "Texto com cara de IA").length;
  const nota = Math.round(limitar(gancho.nota * 0.7 + (100 - atencoes * 20) * 0.3));

  return {
    conteudo: { ...conteudo, gancho: ganchoLimpo.texto, legenda, hashtags },
    analise: {
      nota,
      veredito: nota >= 70 ? "forte" : nota >= 50 ? "ok" : "fraco",
      gancho,
      checagens,
      limpeza: [...ganchoLimpo.trocas, ...legendaLimpa.trocas],
      visivelNoFeed: visivel,
    },
  };
}
