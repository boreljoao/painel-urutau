import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { type Perfil, agendamentos, clientes, despesas, vendas } from "@/db/schema";
import { agendaDoPacote, pacoteDe } from "@/pacotes/catalogo";

export interface Passo {
  id: string;
  titulo: string;
  desc: string;
  href: string;
  feito: boolean;
}

const existe = (q: Promise<{ n: number }[]>) => q.then((r) => (r[0]?.n ?? 0) > 0);

/**
 * O que uma empresa nova faz primeiro para o painel ter números. Some quando tudo está feito;
 * `vazia` diz que ainda não há nenhum lançamento (a visão geral troca os zeros pelos passos).
 */
export async function primeirosPassos(empresaId: string, perfil: Perfil): Promise<{ passos: Passo[]; vazia: boolean }> {
  const db = obterDb();
  const um = sql<number>`1`.as("n");
  const daAgenda = agendaDoPacote(perfil);
  const [temVenda, temDespesa, temCliente, temHorario] = await Promise.all([
    existe(db.select({ n: um }).from(vendas).where(and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm))).limit(1)),
    existe(db.select({ n: um }).from(despesas).where(and(eq(despesas.empresaId, empresaId), isNull(despesas.excluidoEm))).limit(1)),
    existe(db.select({ n: um }).from(clientes).where(and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm))).limit(1)),
    daAgenda ? existe(db.select({ n: um }).from(agendamentos).where(and(eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm))).limit(1)) : Promise.resolve(true),
  ]);
  const base = `/${empresaId}`;
  const { vocab } = pacoteDe(perfil);
  const venda = vocab.vendas === "Recebimentos" ? "o primeiro recebimento" : "a primeira venda";
  const cliente = vocab.clientes.toLowerCase().replace(/s$/, "");
  const passos: Passo[] = [
    { id: "venda", titulo: `Lance ${venda}`, desc: "Pode ser de hoje ou da semana passada. O faturamento e o lucro começam a aparecer.", href: `${base}/vendas`, feito: temVenda },
    { id: "despesa", titulo: "Lance uma conta da empresa", desc: "Aluguel, internet, fornecedor: com as contas, o painel calcula o lucro de verdade.", href: `${base}/financeiro`, feito: temDespesa },
    { id: "cliente", titulo: `Cadastre o primeiro ${cliente}`, desc: "Nome e WhatsApp bastam. Depois cada venda fica ligada a quem comprou.", href: `${base}/clientes`, feito: temCliente },
  ];
  if (daAgenda)
    passos.push({ id: "agenda", titulo: "Marque o primeiro horário", desc: `Na aba ${daAgenda.aba.titulo}: a semana inteira numa tela, com quem vem e a que horas.`, href: `${base}/agenda`, feito: temHorario });
  return { passos, vazia: !temVenda && !temDespesa };
}
