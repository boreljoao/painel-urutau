/**
 * Simulação de financiamento imobiliário (sem banco de dados, sem consulta de CPF).
 *
 * O que o corretor mostra ao cliente antes de mandar para o banco: quanto financia, a primeira e a
 * última parcela em SAC e em Price, quanto paga de juros e a renda mínima que o banco vai pedir.
 * Quem aprova é o banco; aqui é estimativa, com as taxas que a imobiliária digita.
 *
 * Dinheiro em centavos (inteiros). Taxa de juros em % ao ano (efetiva), como os bancos anunciam.
 */

export type Sistema = "sac" | "price";

/** Os bancos financiam no máximo esta fração da renda bruta da família na parcela. */
export const COMPROMETIMENTO_MAX = 0.3;
/** Prazo máximo usual (35 anos) e idade máxima no fim do contrato (80 anos e 6 meses). */
export const PRAZO_MAX_MESES = 420;
export const IDADE_MAX_MESES = 80 * 12 + 6;
/** Fração do imóvel que os bancos costumam financiar no SBPE. Acima disso, avisar. */
export const COTA_MAX = 0.8;

/** Taxas de exemplo para começar. Cada imobiliária troca pelas do dia (ficam salvas no navegador). */
export const BANCOS_PADRAO: { nome: string; taxaAno: number }[] = [
  { nome: "Caixa", taxaAno: 11.5 },
  { nome: "Itaú", taxaAno: 12.2 },
  { nome: "Bradesco", taxaAno: 12.4 },
  { nome: "Santander", taxaAno: 12.6 },
];

/** Seguros obrigatórios e tarifa, estimados: MIP sobre o saldo, DFI sobre o imóvel, tarifa fixa. */
export const SEGURO_MIP_MES = 0.00025;
export const SEGURO_DFI_MES = 0.0001;
export const TARIFA_MES_CENTAVOS = 2_500;

export interface Entrada {
  valorImovel: number;
  entrada: number;
  fgts: number;
  prazoMeses: number;
  taxaAno: number;
  /** Renda bruta da família por mês; 0 = não informada. */
  renda?: number;
  /** Idade do comprador mais velho, em anos; 0 = não informada. */
  idade?: number;
}

export interface Resultado {
  sistema: Sistema;
  financiado: number;
  primeira: number;
  ultima: number;
  /** Parcela com seguros e tarifa (o que sai do bolso no primeiro mês). */
  primeiraComSeguros: number;
  totalPago: number;
  totalJuros: number;
  rendaMinima: number;
}

export interface Simulacao {
  financiado: number;
  cota: number;
  prazoMeses: number;
  taxaMes: number;
  sac: Resultado;
  price: Resultado;
  avisos: string[];
}

/** Taxa mensal equivalente a uma taxa anual efetiva (em %). */
export function taxaMensal(taxaAno: number) {
  return Math.pow(1 + taxaAno / 100, 1 / 12) - 1;
}

/** Prazo que cabe: o pedido, limitado aos 35 anos e à idade máxima no fim do contrato. */
export function prazoPossivel(prazoMeses: number, idade?: number) {
  let p = Math.min(Math.max(1, Math.round(prazoMeses)), PRAZO_MAX_MESES);
  if (idade && idade > 0) p = Math.min(p, Math.max(0, IDADE_MAX_MESES - Math.round(idade * 12)));
  return p;
}

function seguros(saldo: number, valorImovel: number) {
  return Math.round(saldo * SEGURO_MIP_MES + valorImovel * SEGURO_DFI_MES) + TARIFA_MES_CENTAVOS;
}

/** SAC: amortização fixa, parcela começa alta e cai todo mês. */
export function sac(financiado: number, i: number, n: number, valorImovel: number): Resultado {
  const amort = financiado / n;
  const primeira = Math.round(amort + financiado * i);
  const ultima = Math.round(amort * (1 + i));
  const totalJuros = Math.round((i * financiado * (n + 1)) / 2);
  return {
    sistema: "sac",
    financiado,
    primeira,
    ultima,
    primeiraComSeguros: primeira + seguros(financiado, valorImovel),
    totalPago: financiado + totalJuros,
    totalJuros,
    rendaMinima: Math.ceil(primeira / COMPROMETIMENTO_MAX),
  };
}

/** Price: parcela fixa do começo ao fim (sem contar a correção pela TR). */
export function price(financiado: number, i: number, n: number, valorImovel: number): Resultado {
  const pmt = i === 0 ? financiado / n : (financiado * i) / (1 - Math.pow(1 + i, -n));
  const parcela = Math.round(pmt);
  const totalPago = Math.round(pmt * n);
  return {
    sistema: "price",
    financiado,
    primeira: parcela,
    ultima: parcela,
    primeiraComSeguros: parcela + seguros(financiado, valorImovel),
    totalPago,
    totalJuros: totalPago - financiado,
    rendaMinima: Math.ceil(parcela / COMPROMETIMENTO_MAX),
  };
}

export function simular(e: Entrada): Simulacao | null {
  const valor = Math.max(0, Math.round(e.valorImovel));
  const financiado = Math.max(0, valor - Math.max(0, Math.round(e.entrada)) - Math.max(0, Math.round(e.fgts)));
  if (!valor || !financiado) return null;
  const n = prazoPossivel(e.prazoMeses, e.idade);
  if (!n) return null;
  const i = taxaMensal(e.taxaAno);
  const cota = financiado / valor;
  const r = { sac: sac(financiado, i, n, valor), price: price(financiado, i, n, valor) };
  const avisos: string[] = [];
  if (cota > COTA_MAX) avisos.push(`Financia ${Math.round(cota * 100)}% do imóvel. Os bancos costumam ir até ${COTA_MAX * 100}%: aumente a entrada ou use o FGTS.`);
  if (n < Math.round(e.prazoMeses)) {
    avisos.push(
      e.idade && n < Math.min(Math.round(e.prazoMeses), PRAZO_MAX_MESES)
        ? `Pela idade, o prazo vai até ${n} meses (o contrato termina antes dos 80 anos e meio).`
        : `O prazo máximo é de ${PRAZO_MAX_MESES} meses (35 anos).`,
    );
  }
  if (e.renda && e.renda > 0) {
    if (r.sac.primeira > e.renda * COMPROMETIMENTO_MAX && r.price.primeira <= e.renda * COMPROMETIMENTO_MAX)
      avisos.push("Com essa renda, só cabe no Price: a primeira parcela do SAC passa de 30% da renda.");
    else if (r.price.primeira > e.renda * COMPROMETIMENTO_MAX) avisos.push("A parcela passa de 30% da renda: aumente a entrada, o prazo ou some a renda de outra pessoa.");
  }
  return { financiado, cota, prazoMeses: n, taxaMes: i, ...r, avisos };
}

/** Quanto dá para financiar com uma renda: a parcela máxima (30%) trazida a valor presente, no Price. */
export function financiamentoMaximo(renda: number, taxaAno: number, prazoMeses: number) {
  const i = taxaMensal(taxaAno);
  const pmt = renda * COMPROMETIMENTO_MAX;
  const n = prazoPossivel(prazoMeses);
  return Math.floor(i === 0 ? pmt * n : (pmt * (1 - Math.pow(1 + i, -n))) / i);
}
