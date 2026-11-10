import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { agendamentos, clientes, fontesReceita } from "@/db/schema";
import { type Data, hoje, intervaloDoMes, mesAtual, somarDias } from "@/lib/datas";

const colunas = {
  id: agendamentos.id,
  data: agendamentos.data,
  hora: agendamentos.hora,
  duracaoMin: agendamentos.duracaoMin,
  clienteId: agendamentos.clienteId,
  nome: agendamentos.nome,
  servico: agendamentos.servico,
  profissional: agendamentos.profissional,
  sala: agendamentos.sala,
  valorCentavos: agendamentos.valorCentavos,
  status: agendamentos.status,
  observacao: agendamentos.observacao,
  vendaId: agendamentos.vendaId,
  atualizadoEm: agendamentos.atualizadoEm,
  origem: agendamentos.origem,
  online: agendamentos.online,
  serieId: agendamentos.serieId,
  tokenPaciente: agendamentos.tokenPaciente,
  lembretes: agendamentos.lembretes,
  respondidoEm: agendamentos.respondidoEm,
  telefone: clientes.telefone,
};

export type LinhaAgenda = Awaited<ReturnType<typeof listarAgenda>>[number];

/** Os horários de [inicio, fim), em ordem, com o telefone do cliente para confirmar pelo WhatsApp. */
export function listarAgenda(empresaId: string, inicio: Data, fim: Data) {
  return obterDb()
    .select(colunas)
    .from(agendamentos)
    .leftJoin(clientes, and(eq(clientes.id, agendamentos.clienteId), eq(clientes.empresaId, agendamentos.empresaId)))
    .where(and(eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm), gte(agendamentos.data, inicio), lt(agendamentos.data, fim)))
    .orderBy(asc(agendamentos.data), asc(agendamentos.hora));
}

export async function agendamentoDaEmpresa(empresaId: string, id: string) {
  const [a] = await obterDb()
    .select({ ...colunas, criadoPor: agendamentos.criadoPor })
    .from(agendamentos)
    .leftJoin(clientes, and(eq(clientes.id, agendamentos.clienteId), eq(clientes.empresaId, agendamentos.empresaId)))
    .where(and(eq(agendamentos.id, id), eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm)))
    .limit(1);
  return a;
}

/** O que a janela de marcar oferece: os clientes e o que já foi usado em serviço, profissional e sala. */
export async function opcoesDaAgenda(empresaId: string) {
  const db = obterDb();
  const usados = (coluna: typeof agendamentos.servico | typeof agendamentos.profissional | typeof agendamentos.sala) =>
    db
      .selectDistinct({ v: coluna })
      .from(agendamentos)
      .where(and(eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm), ne(coluna, "")))
      .limit(30)
      .then((r) => r.map((x) => x.v));
  const [lista, servicos, profissionais, salas, fontes] = await Promise.all([
    db
      .select({ id: clientes.id, nome: clientes.nome, telefone: clientes.telefone })
      .from(clientes)
      .where(and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm)))
      .orderBy(asc(clientes.nome))
      .limit(2000),
    usados(agendamentos.servico),
    usados(agendamentos.profissional),
    usados(agendamentos.sala),
    db
      .select({ id: fontesReceita.id, nome: fontesReceita.nome, natureza: fontesReceita.natureza })
      .from(fontesReceita)
      .where(and(eq(fontesReceita.empresaId, empresaId), eq(fontesReceita.ativo, true)))
      .orderBy(asc(fontesReceita.ordem), asc(fontesReceita.nome)),
  ]);
  // Na hora de receber um atendimento, as fontes de serviço vêm primeiro.
  fontes.sort((a, b) => Number(b.natureza === "servico") - Number(a.natureza === "servico"));
  return { clientes: lista, servicos, profissionais, salas, fontes: fontes.map(({ id, nome }) => ({ id, nome })) };
}

/** Para a Visão geral: o dia de hoje na agenda e as faltas do mês. */
export async function resumoDaAgenda(empresaId: string) {
  const db = obterDb();
  const dia = hoje();
  const mes = intervaloDoMes(mesAtual());
  const [doDia, [faltas]] = await Promise.all([
    db
      .select({ id: agendamentos.id, hora: agendamentos.hora, duracaoMin: agendamentos.duracaoMin, nome: agendamentos.nome, servico: agendamentos.servico, status: agendamentos.status })
      .from(agendamentos)
      .where(and(eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm), eq(agendamentos.data, dia), ne(agendamentos.status, "cancelado")))
      .orderBy(asc(agendamentos.hora)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(agendamentos)
      .where(and(eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm), eq(agendamentos.status, "faltou"), gte(agendamentos.data, mes.inicio), lt(agendamentos.data, mes.fim))),
  ]);
  return { hoje: doDia, faltasNoMes: faltas?.n ?? 0 };
}

/** Os próximos compromissos (de agora até `dias` à frente), para a Visão geral. */
export async function proximosCompromissos(empresaId: string, dias = 7, limite = 6) {
  const dia = hoje();
  const linhas = await obterDb()
    .select({ id: agendamentos.id, data: agendamentos.data, hora: agendamentos.hora, nome: agendamentos.nome, servico: agendamentos.servico, status: agendamentos.status, veiculoId: agendamentos.veiculoId })
    .from(agendamentos)
    .where(
      and(
        eq(agendamentos.empresaId, empresaId),
        isNull(agendamentos.excluidoEm),
        gte(agendamentos.data, dia),
        lt(agendamentos.data, somarDias(dia, dias + 1)),
        inArray(agendamentos.status, ["marcado", "confirmado"]),
      ),
    )
    .orderBy(asc(agendamentos.data), asc(agendamentos.hora))
    .limit(limite + 10);
  const agora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
  return linhas.filter((a) => a.data > dia || a.hora >= agora).slice(0, limite);
}
