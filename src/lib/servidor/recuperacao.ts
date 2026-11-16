import "server-only";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { type Perfil, clientes, contatosClientes, vendas } from "@/db/schema";
import { somarDias } from "@/lib/datas";
import { type HistoricoCliente, INTERVALO_ENTRE_CONTATOS, clientesParaChamar, linkWhatsapp, mensagemSugerida } from "@/lib/recuperacao";
import { registrarAuditoria } from "./auditoria";

/**
 * Recuperar clientes: a lista de quem chamar (regra em lib/recuperacao.ts), o registro de cada
 * mensagem que a equipe mandou e o resultado. Nada é enviado sozinho: a equipe revisa a mensagem,
 * abre o WhatsApp e confirma que mandou.
 */

export class ErroRecuperacao extends Error {}

export type ResultadoContato = (typeof contatosClientes.$inferSelect)["resultado"];

/** Histórico de compra de cada cliente com telefone que aceita contato. */
export async function historicosDaEmpresa(db: BancoDeDados, empresaId: string, hoje: string): Promise<HistoricoCliente[]> {
  const linhas = await db
    .select({
      clienteId: clientes.id,
      nome: clientes.nome,
      telefone: clientes.telefone,
      // Dias com venda (qualquer origem) ou atendimento feito na agenda.
      dias: sql<string[] | null>`(
        select array_agg(distinct d order by d) from (
          select v.data::text as d from vendas v
            where v.empresa_id = "clientes"."empresa_id" and v.cliente_id = "clientes"."id" and v.excluido_em is null and v.data <= ${hoje}
          union
          select a.data::text from agendamentos a
            where a.empresa_id = "clientes"."empresa_id" and a.cliente_id = "clientes"."id" and a.excluido_em is null and a.status = 'atendido' and a.data <= ${hoje}
        ) x)`,
      gasto: sql<number>`(select coalesce(sum(v.valor_centavos), 0) from vendas v where v.empresa_id = "clientes"."empresa_id" and v.cliente_id = "clientes"."id" and v.excluido_em is null)`.mapWith(Number),
      proximoHorario: sql<string | null>`(
        select min(a.data)::text from agendamentos a
        where a.empresa_id = "clientes"."empresa_id" and a.cliente_id = "clientes"."id" and a.excluido_em is null
          and a.data >= ${hoje} and a.status in ('marcado', 'confirmado'))`,
      ultimoContato: sql<string | null>`(
        select (max(c.criado_em) at time zone 'America/Sao_Paulo')::date::text from contatos_clientes c
        where c.empresa_id = "clientes"."empresa_id" and c.cliente_id = "clientes"."id")`,
    })
    .from(clientes)
    .where(and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm), isNotNull(clientes.telefone), isNull(clientes.naoContatarEm)));
  return linhas.map((l) => ({ ...l, dias: l.dias ?? [], gastoCentavos: l.gasto, naoContatar: false }));
}

/** Quem chamar agora, já com a mensagem sugerida e o link do WhatsApp. */
export async function listaParaChamar(db: BancoDeDados, empresa: { id: string; nome: string; perfil: Perfil }, hoje: string, remetente?: string | null, limite = 30) {
  const lista = clientesParaChamar(await historicosDaEmpresa(db, empresa.id, hoje), hoje, empresa.perfil, limite);
  return lista.map((c) => {
    const mensagem = mensagemSugerida({ nome: c.nome, empresa: empresa.nome, perfil: empresa.perfil, remetente });
    return { ...c, mensagem, whatsapp: linkWhatsapp(c.telefone, mensagem) };
  });
}

/**
 * A equipe mandou a mensagem. Mandar de novo para a mesma pessoa no intervalo devolve o mesmo
 * contato (não conta duas vezes).
 */
export async function registrarContato(
  db: BancoDeDados,
  empresaId: string,
  usuarioId: string,
  c: { clienteId: string; motivo: string; porque: string; mensagem: string },
) {
  return db.transaction(async (tx) => {
    const [cli] = await tx
      .select({ id: clientes.id, nao: clientes.naoContatarEm })
      .from(clientes)
      .where(and(eq(clientes.id, c.clienteId), eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm)))
      .for("update");
    if (!cli) throw new ErroRecuperacao("Cliente não encontrado.");
    if (cli.nao) throw new ErroRecuperacao("Esta pessoa pediu para não receber mensagens.");
    const [recente] = await tx
      .select({ id: contatosClientes.id })
      .from(contatosClientes)
      .where(and(eq(contatosClientes.empresaId, empresaId), eq(contatosClientes.clienteId, c.clienteId), gte(contatosClientes.criadoEm, sql`now() - make_interval(days => ${INTERVALO_ENTRE_CONTATOS})`)))
      .limit(1);
    if (recente) return recente.id;
    const [novo] = await tx
      .insert(contatosClientes)
      .values({ empresaId, clienteId: c.clienteId, motivo: c.motivo.slice(0, 20), porque: c.porque.slice(0, 300), mensagem: c.mensagem.slice(0, 2000), criadoPor: usuarioId })
      .returning({ id: contatosClientes.id });
    await registrarAuditoria(tx as unknown as BancoDeDados, { empresaId, usuarioId, ator: "usuario", acao: "recuperacao.contato", entidade: "cliente", entidadeId: c.clienteId });
    return novo.id;
  });
}

const restricao = (e: unknown) => {
  for (let x: unknown = e; x; x = (x as { cause?: unknown }).cause) {
    const n = (x as { constraint_name?: string }).constraint_name;
    if (n) return n;
  }
  return null;
};

/**
 * O que aconteceu depois da mensagem. "Comprou" exige escolher a venda: só vendas da mesma pessoa,
 * a partir do dia do contato, que ainda não contam para outro contato.
 */
export async function marcarResultado(db: BancoDeDados, empresaId: string, usuarioId: string, contatoId: string, resultado: ResultadoContato, vendaId?: string | null) {
  try {
    await db.transaction(async (tx) => {
      const [c] = await tx
        .select({ id: contatosClientes.id, clienteId: contatosClientes.clienteId, criadoEm: contatosClientes.criadoEm })
        .from(contatosClientes)
        .where(and(eq(contatosClientes.id, contatoId), eq(contatosClientes.empresaId, empresaId)))
        .for("update");
      if (!c) throw new ErroRecuperacao("Contato não encontrado.");
      let venda: string | null = null;
      if (resultado === "comprou") {
        if (!vendaId) throw new ErroRecuperacao("Escolha a venda que veio deste contato.");
        const dia = diaDe(c.criadoEm);
        const [v] = await tx
          .select({ id: vendas.id })
          .from(vendas)
          .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId), eq(vendas.clienteId, c.clienteId), isNull(vendas.excluidoEm), gte(vendas.data, dia)));
        if (!v) throw new ErroRecuperacao("Essa venda não é desta pessoa ou é de antes do contato.");
        venda = v.id;
      }
      await tx.update(contatosClientes).set({ resultado, vendaId: venda, resultadoEm: new Date() }).where(eq(contatosClientes.id, contatoId));
      await registrarAuditoria(tx as unknown as BancoDeDados, { empresaId, usuarioId, ator: "usuario", acao: "recuperacao.resultado", entidade: "cliente", entidadeId: c.clienteId, dados: { resultado, vendaId: venda } });
    });
  } catch (e) {
    if (restricao(e) === "contatos_venda_uq") throw new ErroRecuperacao("Essa venda já conta para outro contato.");
    throw e;
  }
}

/** Pediu para parar: sai de toda lista de contato, e o contato aberto vira "sem interesse". */
export async function naoContatar(db: BancoDeDados, empresaId: string, usuarioId: string, clienteId: string) {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .update(clientes)
      .set({ naoContatarEm: new Date(), atualizadoEm: new Date() })
      .where(and(eq(clientes.id, clienteId), eq(clientes.empresaId, empresaId)))
      .returning({ id: clientes.id });
    if (!c) throw new ErroRecuperacao("Cliente não encontrado.");
    await tx
      .update(contatosClientes)
      .set({ resultado: "sem_interesse", resultadoEm: new Date() })
      .where(and(eq(contatosClientes.empresaId, empresaId), eq(contatosClientes.clienteId, clienteId), eq(contatosClientes.resultado, "enviado")));
    await registrarAuditoria(tx as unknown as BancoDeDados, { empresaId, usuarioId, ator: "usuario", acao: "recuperacao.nao_contatar", entidade: "cliente", entidadeId: clienteId });
  });
}

/** Voltou a aceitar mensagens (pediu de novo, por escrito). */
export async function voltarAContatar(db: BancoDeDados, empresaId: string, clienteId: string) {
  await db.update(clientes).set({ naoContatarEm: null, atualizadoEm: new Date() }).where(and(eq(clientes.id, clienteId), eq(clientes.empresaId, empresaId)));
}

const diaDe = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);

/** Contatos dos últimos 60 dias, com a pessoa e as vendas que dá para ligar a cada um. */
export async function contatosRecentes(db: BancoDeDados, empresaId: string, hoje: string) {
  const lista = await db
    .select({
      id: contatosClientes.id,
      clienteId: contatosClientes.clienteId,
      nome: clientes.nome,
      telefone: clientes.telefone,
      porque: contatosClientes.porque,
      resultado: contatosClientes.resultado,
      vendaId: contatosClientes.vendaId,
      criadoEm: contatosClientes.criadoEm,
      resultadoEm: contatosClientes.resultadoEm,
    })
    .from(contatosClientes)
    .innerJoin(clientes, and(eq(clientes.id, contatosClientes.clienteId), eq(clientes.empresaId, contatosClientes.empresaId)))
    .where(and(eq(contatosClientes.empresaId, empresaId), gte(contatosClientes.criadoEm, sql`${somarDias(hoje, -60)}::date`)))
    .orderBy(desc(contatosClientes.criadoEm))
    .limit(200);
  if (!lista.length) return [];
  // Vendas de cada pessoa desde o contato, que ainda não contam para nenhum contato.
  const candidatas = await db
    .select({ id: vendas.id, clienteId: vendas.clienteId, data: vendas.data, valor: vendas.valorCentavos, descricao: vendas.descricao })
    .from(vendas)
    .where(
      and(
        eq(vendas.empresaId, empresaId),
        isNull(vendas.excluidoEm),
        gte(vendas.data, somarDias(hoje, -60)),
        sql`${vendas.clienteId} in (select cliente_id from contatos_clientes where empresa_id = ${empresaId})`,
        sql`not exists (select 1 from contatos_clientes cc where cc.venda_id = "vendas"."id")`,
      ),
    )
    .orderBy(desc(vendas.data));
  return lista.map((c) => {
    const dia = diaDe(c.criadoEm);
    return { ...c, dia, vendasParaLigar: candidatas.filter((v) => v.clienteId === c.clienteId && v.data >= dia).slice(0, 5) };
  });
}

/** Números da recuperação no período: quantos chamados, quantos responderam, voltaram e quanto venderam. */
export async function resumoRecuperacao(db: BancoDeDados, empresaId: string, desde: string) {
  const [r] = await db
    .select({
      enviados: sql<number>`count(*)::int`,
      responderam: sql<number>`(count(*) filter (where ${contatosClientes.resultado} in ('respondeu', 'agendou', 'comprou')))::int`,
      agendaram: sql<number>`(count(*) filter (where ${contatosClientes.resultado} = 'agendou'))::int`,
      compraram: sql<number>`(count(*) filter (where ${contatosClientes.resultado} = 'comprou'))::int`,
      semInteresse: sql<number>`(count(*) filter (where ${contatosClientes.resultado} = 'sem_interesse'))::int`,
      vendido: sql<number>`coalesce(sum(${vendas.valorCentavos}) filter (where ${vendas.excluidoEm} is null), 0)::bigint`.mapWith(Number),
    })
    .from(contatosClientes)
    .leftJoin(vendas, eq(vendas.id, contatosClientes.vendaId))
    .where(and(eq(contatosClientes.empresaId, empresaId), gte(contatosClientes.criadoEm, sql`${desde}::date`)));
  return r;
}
