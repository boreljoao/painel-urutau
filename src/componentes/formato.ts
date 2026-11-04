/** Formatação da tela. Os valores vêm do banco em centavos. */
const nf0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export const reais = (centavos: number, casas = false) => (casas ? nf2 : nf0).format(centavos / 100);

export function reaisCurto(centavos: number) {
  const v = centavos / 100;
  const sinal = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return `${sinal}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${sinal}R$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${sinal}${nf0.format(a)}`;
}

/** Pcm = por cem mil (como no app): 15_000 é 15%. */
export const porcento = (pcm: number, casas = 0) => `${(pcm / 1000).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter((p) => p.length > 2 || p === nome)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

/** Cada pessoa tem um tom próprio e estável: identidade, nunca dado. */
export function tomDe(texto: string) {
  let h = 0;
  for (const ch of texto) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 88%)`;
}

export function haQuanto(data: Date, agora = new Date()) {
  const min = Math.max(0, Math.round((agora.getTime() - data.getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

const FUSO = "America/Sao_Paulo";
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric", month: "short" });
const diaIso = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO });

/** "há 5 min", "há 3 h", "ontem às 18:40", "em 12 de out." */
export function quando(d: Date, agora = new Date()): string {
  const min = Math.floor((agora.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const dia = diaIso.format(d);
  if (dia === diaIso.format(agora)) return `há ${Math.floor(min / 60)} h`;
  if (dia === diaIso.format(new Date(agora.getTime() - 86_400_000))) return `ontem às ${hora.format(d)}`;
  return `em ${diaMes.format(d)}`;
}
