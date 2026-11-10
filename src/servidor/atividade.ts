import "server-only";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { auditoria } from "@/db/schema";
import type { NomeIcone } from "@/componentes/Icone";

/**
 * O que aconteceu na operação, a partir do registro de auditoria (que já guarda cada venda,
 * conferência, pagamento, horário e mudança de estoque com data e hora). Só eventos que o dono
 * reconhece: configuração e login ficam de fora.
 */

export interface EventoOperacao {
  id: string;
  texto: string;
  icone: NomeIcone;
  /** Caminho dentro da empresa. */
  link: string | null;
  em: Date;
}

const TEXTO: Record<string, { texto: string; icone: NomeIcone; link?: (id: string | null) => string | null }> = {
  "venda.registrar": { texto: "Venda registrada", icone: "carrinho", link: (id) => (id ? `vendas?editar=${id}` : "vendas") },
  "venda.pdv": { texto: "Venda registrada no PDV", icone: "carrinho", link: () => "vendas" },
  "venda.conferir": { texto: "Venda conferida", icone: "check", link: () => "vendas" },
  "venda.receber": { texto: "Recebimento confirmado", icone: "vendas", link: () => "vendas" },
  "venda.estornar": { texto: "Venda estornada", icone: "alerta", link: () => "vendas" },
  "despesa.registrar": { texto: "Despesa lançada", icone: "financeiro", link: () => "financeiro" },
  "despesa.pagar": { texto: "Boleto pago", icone: "documento", link: () => "financeiro" },
  "despesa.marcar_pago": { texto: "Boleto pago", icone: "documento", link: () => "financeiro" },
  "estoque.entrada": { texto: "Estoque atualizado", icone: "caixa", link: () => null },
  "estoque.ajuste": { texto: "Estoque atualizado", icone: "caixa", link: () => null },
  "agenda.marcar": { texto: "Horário marcado", icone: "agenda", link: (id) => (id ? `agenda?editar=${id}` : "agenda") },
  "agenda.status": { texto: "Agenda atualizada", icone: "agenda", link: (id) => (id ? `agenda?editar=${id}` : "agenda") },
  "agenda.receber": { texto: "Atendimento recebido", icone: "vendas", link: () => "agenda" },
  "agenda.confirmado": { texto: "Horário confirmado", icone: "check", link: (id) => (id ? `agenda?editar=${id}` : "agenda") },
  "agenda.cancelado": { texto: "Horário cancelado", icone: "alerta", link: () => "agenda" },
  "agenda.remarcar": { texto: "Horário remarcado pelo paciente", icone: "agenda", link: (id) => (id ? `agenda?editar=${id}` : "agenda") },
  "agenda.lembrete": { texto: "Lembrete enviado pelo WhatsApp", icone: "whatsapp", link: (id) => (id ? `agenda?editar=${id}` : "agenda") },
  "patio.entrada": { texto: "Carro novo no pátio", icone: "carro", link: (id) => (id ? `patio?editar=${id}` : "patio") },
  "patio.status": { texto: "Situação do carro mudou", icone: "carro", link: (id) => (id ? `patio?editar=${id}` : "patio") },
  "patio.editar": { texto: "Carro atualizado", icone: "carro", link: (id) => (id ? `patio?editar=${id}` : "patio") },
  "patio.venda": { texto: "Carro vendido", icone: "vendas", link: () => "patio?ver=vendido" },
  "cliente.criar": { texto: "Cliente cadastrado", icone: "pessoa", link: () => "clientes" },
};

const PREFIXOS = ["venda.", "despesa.", "estoque.", "agenda.", "patio.", "cliente.criar", "conta.pagar", "parcela.pagar"];

export async function atividadeRecente(db: BancoDeDados, empresaId: string, limite = 6): Promise<EventoOperacao[]> {
  const linhas = await db
    .select({ id: auditoria.id, acao: auditoria.acao, entidadeId: auditoria.entidadeId, criadoEm: auditoria.criadoEm })
    .from(auditoria)
    .where(and(eq(auditoria.empresaId, empresaId), inArray(auditoria.ator, ["usuario", "sistema", "agente"]), or(...PREFIXOS.map((p) => like(auditoria.acao, `${p}%`)))))
    .orderBy(desc(auditoria.criadoEm))
    .limit(limite);
  return linhas.map((l) => {
    const t = TEXTO[l.acao];
    const generico = l.acao.startsWith("despesa.") ? "Contas atualizadas" : l.acao.startsWith("venda.") ? "Vendas atualizadas" : l.acao.startsWith("agenda.") ? "Agenda atualizada" : "Atualização";
    return {
      id: l.id,
      texto: t?.texto ?? generico,
      icone: t?.icone ?? "check",
      link: t?.link ? t.link(l.entidadeId) : null,
      em: l.criadoEm,
    };
  });
}
