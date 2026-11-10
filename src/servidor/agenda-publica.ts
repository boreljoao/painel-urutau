import "server-only";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { obterDb } from "@/db";
import { agendamentos, empresaPainel, empresas } from "@/db/schema";
import { type Data, diaDaSemana, hoje, somarDias } from "@/lib/datas";
import { agendaDoPacote } from "@/pacotes/catalogo";
import { type ItemAgenda, agoraEmMinutos, choques, horariosLivres, minutos } from "@/pacotes/agenda";

/**
 * A agenda vista de fora: a página de agendamento de cada empresa (/agendar/<endereço>) e a página
 * do paciente (/confirmar/<código>). Nada aqui exige login; por isso só sai o necessário: horários
 * livres, nunca quem está marcado.
 */

export async function empresaPorSlug(slug: string) {
  const [linha] = await obterDb()
    .select({ empresa: empresas, config: empresaPainel })
    .from(empresaPainel)
    .innerJoin(empresas, eq(empresas.id, empresaPainel.empresaId))
    .where(and(eq(empresaPainel.slug, slug.toLowerCase()), eq(empresaPainel.agendaOnline, true)))
    .limit(1);
  if (!linha) return null;
  const daAgenda = agendaDoPacote(linha.empresa.perfil, linha.config.especialidade);
  if (!daAgenda) return null;
  return { ...linha, cfg: daAgenda.cfg };
}

export type EmpresaPublica = NonNullable<Awaited<ReturnType<typeof empresaPorSlug>>>;

const ocupados = (empresaId: string, inicio: Data, fim: Data) =>
  obterDb()
    .select({ id: agendamentos.id, data: agendamentos.data, hora: agendamentos.hora, duracaoMin: agendamentos.duracaoMin, status: agendamentos.status, profissional: agendamentos.profissional, sala: agendamentos.sala })
    .from(agendamentos)
    .where(and(eq(agendamentos.empresaId, empresaId), isNull(agendamentos.excluidoEm), gte(agendamentos.data, inicio), lt(agendamentos.data, fim)));

/** Os horários que o paciente pode escolher, dia a dia, respeitando expediente, bloqueios e antecedência. */
export async function horariosOnline(e: EmpresaPublica, ignorarId?: string): Promise<{ data: Data; horas: string[] }[]> {
  const hj = hoje();
  const dias = Math.min(Math.max(e.config.diasOnline, 1), 60);
  const itens = (await ocupados(e.empresa.id, hj, somarDias(hj, dias))).filter((a) => a.id !== ignorarId);
  // Antecedência mínima em minutos a partir de agora (no fuso de Brasília).
  const limite = agoraEmMinutos() + Math.max(e.config.antecedenciaHoras, 0) * 60;
  const lista: { data: Data; horas: string[] }[] = [];
  for (let i = 0; i < dias; i++) {
    const d = somarDias(hj, i);
    if (diaDaSemana(d) === 0) continue; // domingo fechado
    const desde = limite - i * 1440;
    if (desde >= e.cfg.fim * 60) continue;
    const horas = horariosLivres(itens.filter((a) => a.data === d) as ItemAgenda[], e.cfg, Math.max(desde, 0));
    if (horas.length) lista.push({ data: d, horas });
  }
  return lista;
}

/** O horário ainda está livre? (Outra pessoa pode ter marcado enquanto a página estava aberta.) */
export async function horarioLivre(e: EmpresaPublica, data: Data, hora: string, ignorarId?: string) {
  const oferecidos = await horariosOnline(e, ignorarId);
  if (!oferecidos.some((d) => d.data === data && d.horas.includes(hora))) return false;
  const dia = (await ocupados(e.empresa.id, data, somarDias(data, 1))).filter((a) => a.id !== ignorarId) as ItemAgenda[];
  return choques({ data, hora, duracaoMin: e.cfg.duracao, profissional: "", sala: "" }, dia).length === 0;
}

export async function agendamentoPorToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const db = obterDb();
  const [a] = await db
    .select({ ag: agendamentos, empresa: empresas, config: empresaPainel })
    .from(agendamentos)
    .innerJoin(empresas, eq(empresas.id, agendamentos.empresaId))
    .leftJoin(empresaPainel, eq(empresaPainel.empresaId, agendamentos.empresaId))
    .where(and(eq(agendamentos.tokenPaciente, token), isNull(agendamentos.excluidoEm)))
    .limit(1);
  if (!a) return null;
  const daAgenda = agendaDoPacote(a.empresa.perfil, a.config?.especialidade);
  return { ...a, cfg: daAgenda?.cfg ?? null };
}

/** Já passou? (Na página do paciente, um horário que já aconteceu não aceita mais mudança.) */
export const jaPassou = (a: { data: Data; hora: string }) => a.data < hoje() || (a.data === hoje() && minutos(a.hora) <= agoraEmMinutos());
