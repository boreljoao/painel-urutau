import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import {
  type EtapaNegocio,
  type FinalidadeImovel,
  type StatusImovel,
  agendamentos,
  alugueisMes,
  clientes,
  contratosLocacao,
  fontesReceita,
  imoveis,
  negociosImoveis,
  vendas,
} from "@/db/schema";
import { type Data, somarDias } from "@/lib/datas";
import { ETAPAS_ABERTAS, comissao, divisaoAluguel, nomeTipo } from "@/lib/imobiliaria";
import { registrarAuditoria } from "./auditoria";

/**
 * Imobiliária: carteira de imóveis, funil de negócios, contratos de locação e o aluguel de cada
 * mês. Fechar negócio e receber aluguel travam o registro (FOR UPDATE) e só lançam receita uma vez.
 */

export class ErroImobiliaria extends Error {}
type Tx = Parameters<Parameters<BancoDeDados["transaction"]>[0]>[0];
const auditar = (tx: Tx, d: Parameters<typeof registrarAuditoria>[1]) => registrarAuditoria(tx as unknown as BancoDeDados, d);

// ─── Imóveis ─────────────────────────────────────────────────────────────────

export interface DadosImovel {
  codigo: string;
  titulo: string;
  tipo: string;
  finalidade: FinalidadeImovel;
  bairro: string;
  cidade: string;
  endereco: string;
  areaM2: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  precoVendaCentavos: number | null;
  aluguelCentavos: number | null;
  condominioCentavos: number | null;
  iptuCentavos: number | null;
  destaques: string[];
  fotos: string[];
  descricao: string;
  proprietarioId: string | null;
  corretor: string;
  comissaoPcm: number;
  exclusivo: boolean;
  captadoEm: Data;
}

async function clienteDaEmpresa(db: BancoDeDados | Tx, empresaId: string, id: string | null) {
  if (!id) return true;
  const [c] = await db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, id), eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm)));
  return !!c;
}

const codigoRepetido = (e: unknown) => {
  for (let x: unknown = e; x; x = (x as { cause?: unknown }).cause) if ((x as { constraint_name?: string }).constraint_name === "imoveis_codigo_uq") return true;
  return false;
};

export async function salvarImovel(db: BancoDeDados, empresaId: string, usuarioId: string, id: string | null, d: DadosImovel) {
  if (!(await clienteDaEmpresa(db, empresaId, d.proprietarioId))) throw new ErroImobiliaria("Proprietário não encontrado.");
  try {
    if (id) {
      const [i] = await db
        .update(imoveis)
        .set({ ...d, atualizadoEm: new Date() })
        .where(and(eq(imoveis.id, id), eq(imoveis.empresaId, empresaId), isNull(imoveis.excluidoEm)))
        .returning({ id: imoveis.id });
      if (!i) throw new ErroImobiliaria("Imóvel não encontrado.");
      return i.id;
    }
    const [i] = await db.insert(imoveis).values({ ...d, empresaId, criadoPor: usuarioId }).returning({ id: imoveis.id });
    await registrarAuditoria(db, { empresaId, usuarioId, ator: "usuario", acao: "imovel.captar", entidade: "imovel", entidadeId: i.id, dados: { codigo: d.codigo } });
    return i.id;
  } catch (e) {
    if (codigoRepetido(e)) throw new ErroImobiliaria(`Já existe um imóvel com o código ${d.codigo}.`);
    throw e;
  }
}

export async function mudarStatusImovel(db: BancoDeDados, empresaId: string, usuarioId: string, id: string, status: StatusImovel) {
  const [i] = await db
    .update(imoveis)
    .set({ status, fechadoEm: status === "vendido" || status === "alugado" ? sql`coalesce(${imoveis.fechadoEm}, current_date)` : null, atualizadoEm: new Date() })
    .where(and(eq(imoveis.id, id), eq(imoveis.empresaId, empresaId), isNull(imoveis.excluidoEm)))
    .returning({ codigo: imoveis.codigo });
  if (!i) throw new ErroImobiliaria("Imóvel não encontrado.");
  await registrarAuditoria(db, { empresaId, usuarioId, ator: "usuario", acao: "imovel.status", entidade: "imovel", entidadeId: id, dados: { status, codigo: i.codigo } });
}

export async function excluirImovel(db: BancoDeDados, empresaId: string, id: string) {
  await db.update(imoveis).set({ excluidoEm: new Date() }).where(and(eq(imoveis.id, id), eq(imoveis.empresaId, empresaId)));
}

export interface FiltroImoveis {
  finalidade?: "venda" | "aluguel";
  status?: StatusImovel | "ativos";
  tipo?: string;
  busca?: string;
}

export async function listarImoveis(db: BancoDeDados, empresaId: string, f: FiltroImoveis = {}) {
  const termo = f.busca?.trim();
  const linhas = await db
    .select({
      imovel: imoveis,
      proprietario: clientes.nome,
      interessados: sql<number>`(select count(*)::int from negocios_imoveis n where n.imovel_id = "imoveis"."id" and n.excluido_em is null and n.etapa in ('lead', 'atendimento', 'visita', 'proposta'))`,
      visitas30d: sql<number>`(select count(*)::int from agendamentos a where a.imovel_id = "imoveis"."id" and a.excluido_em is null and a.data >= current_date - 30 and a.status <> 'cancelado')`,
    })
    .from(imoveis)
    .leftJoin(clientes, and(eq(clientes.id, imoveis.proprietarioId), eq(clientes.empresaId, imoveis.empresaId)))
    .where(
      and(
        eq(imoveis.empresaId, empresaId),
        isNull(imoveis.excluidoEm),
        f.finalidade ? inArray(imoveis.finalidade, [f.finalidade, "venda_aluguel"]) : undefined,
        !f.status || f.status === "ativos" ? inArray(imoveis.status, ["disponivel", "reservado"]) : eq(imoveis.status, f.status),
        f.tipo ? eq(imoveis.tipo, f.tipo) : undefined,
        termo
          ? sql`(${imoveis.codigo} ilike ${`%${termo}%`} or ${imoveis.titulo} ilike ${`%${termo}%`} or ${imoveis.bairro} ilike ${`%${termo}%`})`
          : undefined,
      ),
    )
    .orderBy(desc(imoveis.exclusivo), desc(imoveis.captadoEm), asc(imoveis.codigo))
    .limit(300);
  return linhas.map((l) => ({ ...l.imovel, proprietario: l.proprietario, interessados: l.interessados, visitas30d: l.visitas30d }));
}

export async function imovelDaEmpresa(db: BancoDeDados, empresaId: string, id: string) {
  const [i] = await db
    .select()
    .from(imoveis)
    .where(and(eq(imoveis.id, id), eq(imoveis.empresaId, empresaId), isNull(imoveis.excluidoEm)));
  return i ?? null;
}

export async function codigosDaEmpresa(db: BancoDeDados, empresaId: string) {
  return (await db.select({ c: imoveis.codigo }).from(imoveis).where(eq(imoveis.empresaId, empresaId))).map((r) => r.c);
}

/** Para listas de escolha (visita, negócio, contrato). */
export async function opcoesDeImoveis(db: BancoDeDados, empresaId: string) {
  return db
    .select({ id: imoveis.id, codigo: imoveis.codigo, titulo: imoveis.titulo, bairro: imoveis.bairro, status: imoveis.status, finalidade: imoveis.finalidade, aluguel: imoveis.aluguelCentavos, proprietarioId: imoveis.proprietarioId })
    .from(imoveis)
    .where(and(eq(imoveis.empresaId, empresaId), isNull(imoveis.excluidoEm)))
    .orderBy(asc(imoveis.codigo));
}

// ─── Funil ───────────────────────────────────────────────────────────────────

export interface DadosNegocio {
  clienteId: string;
  imovelId: string | null;
  tipo: "compra" | "locacao";
  valorCentavos: number | null;
  origem: string;
  corretor: string;
  procura: string;
  proximoPasso: string;
  proximoEm: Data | null;
}

async function imovelValido(db: BancoDeDados | Tx, empresaId: string, id: string | null) {
  if (!id) return true;
  return !!(await db.select({ id: imoveis.id }).from(imoveis).where(and(eq(imoveis.id, id), eq(imoveis.empresaId, empresaId), isNull(imoveis.excluidoEm))))[0];
}

export async function salvarNegocio(db: BancoDeDados, empresaId: string, usuarioId: string, id: string | null, d: DadosNegocio) {
  if (!(await clienteDaEmpresa(db, empresaId, d.clienteId))) throw new ErroImobiliaria("Cliente não encontrado.");
  if (!(await imovelValido(db, empresaId, d.imovelId))) throw new ErroImobiliaria("Imóvel não encontrado.");
  if (id) {
    const [n] = await db
      .update(negociosImoveis)
      .set({ ...d, atualizadoEm: new Date() })
      .where(and(eq(negociosImoveis.id, id), eq(negociosImoveis.empresaId, empresaId), isNull(negociosImoveis.excluidoEm)))
      .returning({ id: negociosImoveis.id });
    if (!n) throw new ErroImobiliaria("Negócio não encontrado.");
    return n.id;
  }
  const [n] = await db.insert(negociosImoveis).values({ ...d, empresaId, criadoPor: usuarioId }).returning({ id: negociosImoveis.id });
  await registrarAuditoria(db, { empresaId, usuarioId, ator: "usuario", acao: "negocio.criar", entidade: "negocio", entidadeId: n.id });
  return n.id;
}

/** Muda de etapa (menos "fechado", que tem o próprio comando porque lança a comissão). */
export async function moverNegocio(db: BancoDeDados, empresaId: string, usuarioId: string, id: string, etapa: Exclude<EtapaNegocio, "fechado">, motivoPerda?: string | null) {
  if (etapa === "perdido" && !motivoPerda?.trim()) throw new ErroImobiliaria("Diga o motivo da perda (ajuda a entender onde o funil vaza).");
  const [n] = await db
    .update(negociosImoveis)
    .set({ etapa, etapaDesde: new Date(), motivoPerda: etapa === "perdido" ? motivoPerda!.trim().slice(0, 200) : null, atualizadoEm: new Date() })
    .where(and(eq(negociosImoveis.id, id), eq(negociosImoveis.empresaId, empresaId), isNull(negociosImoveis.excluidoEm), ne(negociosImoveis.etapa, "fechado")))
    .returning({ id: negociosImoveis.id });
  if (!n) throw new ErroImobiliaria("Negócio não encontrado ou já fechado.");
  await registrarAuditoria(db, { empresaId, usuarioId, ator: "usuario", acao: "negocio.etapa", entidade: "negocio", entidadeId: id, dados: { etapa } });
}

async function fonteDaEmpresa(tx: Tx, empresaId: string, nome: RegExp) {
  const lista = await tx.select({ id: fontesReceita.id, nome: fontesReceita.nome }).from(fontesReceita).where(and(eq(fontesReceita.empresaId, empresaId), eq(fontesReceita.ativo, true))).orderBy(asc(fontesReceita.ordem));
  const f = lista.find((x) => nome.test(x.nome)) ?? lista[0];
  if (!f) throw new ErroImobiliaria("Cadastre uma fonte de receita antes.");
  return f.id;
}

/**
 * Fechou: o negócio vai para "fechado", o imóvel para vendido/alugado e a comissão da
 * imobiliária entra como venda (a receber até o dia combinado). Travado: dois cliques fecham uma vez.
 */
export async function fecharNegocio(db: BancoDeDados, empresaId: string, usuarioId: string, id: string, f: { valorCentavos: number; comissaoPcm: number; data: Data; recebido: boolean }) {
  if (!(f.valorCentavos > 0)) throw new ErroImobiliaria("Informe o valor fechado.");
  return db.transaction(async (tx) => {
    const [n] = await tx
      .select()
      .from(negociosImoveis)
      .where(and(eq(negociosImoveis.id, id), eq(negociosImoveis.empresaId, empresaId), isNull(negociosImoveis.excluidoEm)))
      .for("update");
    if (!n) throw new ErroImobiliaria("Negócio não encontrado.");
    if (n.etapa === "fechado" || n.vendaId) throw new ErroImobiliaria("Este negócio já foi fechado.");
    const valorComissao = comissao(f.valorCentavos, f.comissaoPcm);
    let imovelTexto = "";
    if (n.imovelId) {
      const [i] = await tx.select().from(imoveis).where(and(eq(imoveis.id, n.imovelId), eq(imoveis.empresaId, empresaId))).for("update");
      if (i) {
        imovelTexto = ` · ${i.codigo} ${nomeTipo(i.tipo).toLowerCase()} ${i.bairro}`.trimEnd();
        await tx
          .update(imoveis)
          .set({ status: n.tipo === "locacao" ? "alugado" : "vendido", fechadoEm: f.data, atualizadoEm: new Date() })
          .where(eq(imoveis.id, i.id));
      }
    }
    let vendaId: string | null = null;
    if (valorComissao > 0) {
      const fonte = await fonteDaEmpresa(tx, empresaId, n.tipo === "locacao" ? /loca/i : /venda/i);
      const [v] = await tx
        .insert(vendas)
        .values({
          empresaId,
          data: f.data,
          valorCentavos: valorComissao,
          descricao: `Comissão de ${n.tipo === "locacao" ? "locação" : "venda"}${imovelTexto}`.slice(0, 300),
          fonteReceitaId: fonte,
          formaPagamento: "transferencia",
          status: f.recebido ? "recebido" : "a_receber",
          dataRecebimento: f.recebido ? f.data : somarDias(f.data, 30),
          clienteId: n.clienteId,
          criadoPor: usuarioId,
        })
        .returning({ id: vendas.id });
      vendaId = v.id;
    }
    await tx
      .update(negociosImoveis)
      .set({ etapa: "fechado", etapaDesde: new Date(), valorCentavos: f.valorCentavos, vendaId, fechadoEm: f.data, atualizadoEm: new Date() })
      .where(eq(negociosImoveis.id, id));
    await auditar(tx, { empresaId, usuarioId, ator: "usuario", acao: "negocio.fechar", entidade: "negocio", entidadeId: id, dados: { valorCentavos: f.valorCentavos, comissaoCentavos: valorComissao, vendaId } });
    return { vendaId, comissaoCentavos: valorComissao };
  });
}

export async function listarNegocios(db: BancoDeDados, empresaId: string, desdeFechados: Data) {
  const linhas = await db
    .select({
      negocio: negociosImoveis,
      cliente: clientes.nome,
      telefone: clientes.telefone,
      imovelCodigo: imoveis.codigo,
      imovelTitulo: imoveis.titulo,
      imovelBairro: imoveis.bairro,
      comissaoPcm: imoveis.comissaoPcm,
    })
    .from(negociosImoveis)
    .innerJoin(clientes, and(eq(clientes.id, negociosImoveis.clienteId), eq(clientes.empresaId, negociosImoveis.empresaId)))
    .leftJoin(imoveis, and(eq(imoveis.id, negociosImoveis.imovelId), eq(imoveis.empresaId, negociosImoveis.empresaId)))
    .where(
      and(
        eq(negociosImoveis.empresaId, empresaId),
        isNull(negociosImoveis.excluidoEm),
        sql`(${negociosImoveis.etapa} in ('lead', 'atendimento', 'visita', 'proposta') or ${negociosImoveis.atualizadoEm} >= ${desdeFechados}::date)`,
      ),
    )
    .orderBy(asc(negociosImoveis.proximoEm), desc(negociosImoveis.atualizadoEm))
    .limit(500);
  return linhas.map((l) => ({ ...l.negocio, cliente: l.cliente, telefone: l.telefone, imovelCodigo: l.imovelCodigo, imovelTitulo: l.imovelTitulo, imovelBairro: l.imovelBairro, comissaoPcm: l.comissaoPcm }));
}

// ─── Locação ─────────────────────────────────────────────────────────────────

export interface DadosContrato {
  imovelId: string;
  inquilinoId: string;
  proprietarioId: string | null;
  inicio: Data;
  fim: Data;
  aluguelCentavos: number;
  taxaAdmPcm: number;
  diaVencimento: number;
  indice: string;
  garantia: string;
}

export async function salvarContrato(db: BancoDeDados, empresaId: string, usuarioId: string, d: DadosContrato) {
  if (d.fim <= d.inicio) throw new ErroImobiliaria("O fim do contrato precisa ser depois do início.");
  if (!(await clienteDaEmpresa(db, empresaId, d.inquilinoId)) || !(await clienteDaEmpresa(db, empresaId, d.proprietarioId))) throw new ErroImobiliaria("Inquilino ou proprietário não encontrado.");
  return db.transaction(async (tx) => {
    const [i] = await tx.select({ id: imoveis.id }).from(imoveis).where(and(eq(imoveis.id, d.imovelId), eq(imoveis.empresaId, empresaId), isNull(imoveis.excluidoEm))).for("update");
    if (!i) throw new ErroImobiliaria("Imóvel não encontrado.");
    const [ativo] = await tx
      .select({ id: contratosLocacao.id })
      .from(contratosLocacao)
      .where(and(eq(contratosLocacao.empresaId, empresaId), eq(contratosLocacao.imovelId, d.imovelId), isNull(contratosLocacao.encerradoEm), isNull(contratosLocacao.excluidoEm)));
    if (ativo) throw new ErroImobiliaria("Este imóvel já tem um contrato ativo.");
    const [c] = await tx.insert(contratosLocacao).values({ ...d, empresaId, criadoPor: usuarioId }).returning({ id: contratosLocacao.id });
    await tx.update(imoveis).set({ status: "alugado", fechadoEm: d.inicio, atualizadoEm: new Date() }).where(eq(imoveis.id, d.imovelId));
    await auditar(tx, { empresaId, usuarioId, ator: "usuario", acao: "locacao.contrato", entidade: "contrato", entidadeId: c.id });
    return c.id;
  });
}

/** Encerra o contrato; o imóvel volta para disponível (para anunciar de novo). */
export async function encerrarContrato(db: BancoDeDados, empresaId: string, usuarioId: string, id: string, em: Data) {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .update(contratosLocacao)
      .set({ encerradoEm: em, atualizadoEm: new Date() })
      .where(and(eq(contratosLocacao.id, id), eq(contratosLocacao.empresaId, empresaId), isNull(contratosLocacao.encerradoEm)))
      .returning({ imovelId: contratosLocacao.imovelId });
    if (!c) throw new ErroImobiliaria("Contrato não encontrado ou já encerrado.");
    await tx.update(imoveis).set({ status: "disponivel", fechadoEm: null, atualizadoEm: new Date() }).where(and(eq(imoveis.id, c.imovelId), eq(imoveis.empresaId, empresaId)));
    await auditar(tx, { empresaId, usuarioId, ator: "usuario", acao: "locacao.encerrar", entidade: "contrato", entidadeId: id });
  });
}

export async function listarContratos(db: BancoDeDados, empresaId: string) {
  const inquilino = sql<string>`(select nome from clientes c where c.id = ${contratosLocacao.inquilinoId})`;
  const proprietario = sql<string | null>`(select nome from clientes c where c.id = ${contratosLocacao.proprietarioId})`;
  return db
    .select({
      contrato: contratosLocacao,
      inquilino,
      inquilinoTelefone: sql<string | null>`(select telefone from clientes c where c.id = ${contratosLocacao.inquilinoId})`,
      proprietario,
      imovelCodigo: imoveis.codigo,
      imovelTitulo: imoveis.titulo,
      imovelBairro: imoveis.bairro,
    })
    .from(contratosLocacao)
    .innerJoin(imoveis, and(eq(imoveis.id, contratosLocacao.imovelId), eq(imoveis.empresaId, contratosLocacao.empresaId)))
    .where(and(eq(contratosLocacao.empresaId, empresaId), isNull(contratosLocacao.excluidoEm), isNull(contratosLocacao.encerradoEm)))
    .orderBy(asc(contratosLocacao.fim));
}

/**
 * O aluguel do mês de cada contrato ativo. Cria a linha do mês na primeira vez que alguém olha
 * (on conflict do nothing: duas telas abertas não duplicam).
 */
export async function alugueisDoMes(db: BancoDeDados, empresaId: string, competencia: string) {
  const inicioMes = `${competencia}-01`;
  const ativos = await db
    .select({ id: contratosLocacao.id, aluguel: contratosLocacao.aluguelCentavos, taxa: contratosLocacao.taxaAdmPcm })
    .from(contratosLocacao)
    .where(
      and(
        eq(contratosLocacao.empresaId, empresaId),
        isNull(contratosLocacao.excluidoEm),
        lte(contratosLocacao.inicio, sql`(${inicioMes}::date + interval '1 month' - interval '1 day')::date`),
        sql`coalesce(${contratosLocacao.encerradoEm}, ${contratosLocacao.fim}) >= ${inicioMes}::date`,
      ),
    );
  if (ativos.length)
    await db
      .insert(alugueisMes)
      .values(ativos.map((c) => ({ empresaId, contratoId: c.id, competencia, aluguelCentavos: c.aluguel, taxaAdmCentavos: divisaoAluguel(c.aluguel, c.taxa).taxa })))
      .onConflictDoNothing();
  return db
    .select({
      aluguel: alugueisMes,
      diaVencimento: contratosLocacao.diaVencimento,
      inquilino: sql<string>`(select nome from clientes c where c.id = ${contratosLocacao.inquilinoId})`,
      telefone: sql<string | null>`(select telefone from clientes c where c.id = ${contratosLocacao.inquilinoId})`,
      proprietario: sql<string | null>`(select nome from clientes c where c.id = ${contratosLocacao.proprietarioId})`,
      imovelCodigo: imoveis.codigo,
      imovelTitulo: imoveis.titulo,
    })
    .from(alugueisMes)
    .innerJoin(contratosLocacao, and(eq(contratosLocacao.id, alugueisMes.contratoId), eq(contratosLocacao.empresaId, alugueisMes.empresaId)))
    .innerJoin(imoveis, and(eq(imoveis.id, contratosLocacao.imovelId), eq(imoveis.empresaId, contratosLocacao.empresaId)))
    .where(and(eq(alugueisMes.empresaId, empresaId), eq(alugueisMes.competencia, competencia)))
    .orderBy(asc(contratosLocacao.diaVencimento), asc(imoveis.codigo));
}

/** O inquilino pagou: marca o mês e lança a taxa de administração como receita (uma vez só). */
export async function receberAluguel(db: BancoDeDados, empresaId: string, usuarioId: string, id: string, data: Data) {
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(alugueisMes).where(and(eq(alugueisMes.id, id), eq(alugueisMes.empresaId, empresaId))).for("update");
    if (!a) throw new ErroImobiliaria("Aluguel não encontrado.");
    if (a.recebidoEm) throw new ErroImobiliaria("Este aluguel já foi recebido.");
    const [c] = await tx.select({ inquilinoId: contratosLocacao.inquilinoId, imovelId: contratosLocacao.imovelId }).from(contratosLocacao).where(eq(contratosLocacao.id, a.contratoId));
    const [i] = await tx.select({ codigo: imoveis.codigo }).from(imoveis).where(eq(imoveis.id, c.imovelId));
    let vendaId: string | null = null;
    if (a.taxaAdmCentavos > 0) {
      const fonte = await fonteDaEmpresa(tx, empresaId, /administra/i);
      const [v] = await tx
        .insert(vendas)
        .values({
          empresaId,
          data,
          valorCentavos: a.taxaAdmCentavos,
          descricao: `Taxa de administração ${a.competencia.slice(5)}/${a.competencia.slice(0, 4)} · ${i?.codigo ?? ""}`.trim(),
          fonteReceitaId: fonte,
          formaPagamento: "pix",
          status: "recebido",
          dataRecebimento: data,
          clienteId: c.inquilinoId,
          criadoPor: usuarioId,
        })
        .returning({ id: vendas.id });
      vendaId = v.id;
    }
    await tx.update(alugueisMes).set({ recebidoEm: data, vendaId }).where(eq(alugueisMes.id, id));
    await auditar(tx, { empresaId, usuarioId, ator: "usuario", acao: "locacao.receber", entidade: "aluguel", entidadeId: id, dados: { aluguelCentavos: a.aluguelCentavos } });
  });
}

/** O dinheiro do proprietário foi transferido. Só depois de receber do inquilino. */
export async function repassarAluguel(db: BancoDeDados, empresaId: string, usuarioId: string, id: string, data: Data) {
  const [a] = await db
    .update(alugueisMes)
    .set({ repassadoEm: data })
    .where(and(eq(alugueisMes.id, id), eq(alugueisMes.empresaId, empresaId), sql`${alugueisMes.recebidoEm} is not null`, isNull(alugueisMes.repassadoEm)))
    .returning({ id: alugueisMes.id, valor: alugueisMes.aluguelCentavos, taxa: alugueisMes.taxaAdmCentavos });
  if (!a) throw new ErroImobiliaria("Receba o aluguel antes de repassar (ou ele já foi repassado).");
  await registrarAuditoria(db, { empresaId, usuarioId, ator: "usuario", acao: "locacao.repassar", entidade: "aluguel", entidadeId: id, dados: { repasseCentavos: a.valor - a.taxa } });
}

// ─── Visão geral ─────────────────────────────────────────────────────────────

export async function painelImobiliaria(db: BancoDeDados, empresaId: string, hoje: Data) {
  const desde30 = somarDias(hoje, -30);
  const [[carteira], funil, [visitas], [vencendo]] = await Promise.all([
    db
      .select({
        disponiveis: sql<number>`(count(*) filter (where ${imoveis.status} in ('disponivel', 'reservado')))::int`,
        venda: sql<number>`(count(*) filter (where ${imoveis.status} in ('disponivel', 'reservado') and ${imoveis.finalidade} <> 'aluguel'))::int`,
        aluguel: sql<number>`(count(*) filter (where ${imoveis.status} in ('disponivel', 'reservado') and ${imoveis.finalidade} <> 'venda'))::int`,
        vgv: sql<number>`coalesce(sum(${imoveis.precoVendaCentavos}) filter (where ${imoveis.status} in ('disponivel', 'reservado') and ${imoveis.finalidade} <> 'aluguel'), 0)::bigint`.mapWith(Number),
        comissaoPotencial: sql<number>`coalesce(sum(round(${imoveis.precoVendaCentavos}::numeric * ${imoveis.comissaoPcm} / 100000)) filter (where ${imoveis.status} in ('disponivel', 'reservado') and ${imoveis.finalidade} <> 'aluguel'), 0)::bigint`.mapWith(Number),
        alugados: sql<number>`(count(*) filter (where ${imoveis.status} = 'alugado'))::int`,
        captados30d: sql<number>`(count(*) filter (where ${imoveis.captadoEm} >= ${desde30}::date))::int`,
        paradosMais90: sql<number>`(count(*) filter (where ${imoveis.status} = 'disponivel' and ${imoveis.captadoEm} < ${somarDias(hoje, -90)}::date))::int`,
      })
      .from(imoveis)
      .where(and(eq(imoveis.empresaId, empresaId), isNull(imoveis.excluidoEm))),
    db
      .select({ etapa: negociosImoveis.etapa, n: sql<number>`count(*)::int`, valor: sql<number>`coalesce(sum(${negociosImoveis.valorCentavos}), 0)::bigint`.mapWith(Number) })
      .from(negociosImoveis)
      .where(and(eq(negociosImoveis.empresaId, empresaId), isNull(negociosImoveis.excluidoEm), sql`(${negociosImoveis.etapa} in ('lead', 'atendimento', 'visita', 'proposta') or ${negociosImoveis.atualizadoEm} >= ${desde30}::date)`))
      .groupBy(negociosImoveis.etapa),
    db
      .select({ semana: sql<number>`count(*)::int` })
      .from(agendamentos)
      .where(and(eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm), gte(agendamentos.data, hoje), lte(agendamentos.data, somarDias(hoje, 6)), ne(agendamentos.status, "cancelado"), ne(agendamentos.status, "bloqueado"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contratosLocacao)
      .where(and(eq(contratosLocacao.empresaId, empresaId), isNull(contratosLocacao.excluidoEm), isNull(contratosLocacao.encerradoEm), lte(contratosLocacao.fim, somarDias(hoje, 90)))),
  ]);
  const porEtapa = Object.fromEntries(funil.map((f) => [f.etapa, f])) as Partial<Record<EtapaNegocio, { n: number; valor: number }>>;
  const abertos = ETAPAS_ABERTAS.reduce((s, e) => s + (porEtapa[e]?.n ?? 0), 0);
  return { carteira, porEtapa, abertos, visitasSemana: visitas.semana, contratosVencendo: vencendo.n };
}
