import type { ItemMenuEmpresa, Modulo, Papel, Perfil } from "@/db/schema";
import { type Acao, pode } from "@/lib/permissoes";
import type { NomeIcone } from "@/componentes/Icone";
import { pacoteDe } from "@/pacotes/catalogo";

/**
 * O menu do painel: o que cada ramo vê por padrão (seções Operação, Gestão e Divulgação) e o que a
 * empresa mudou (ordem, nomes, itens escondidos e a tela inicial). As permissões vêm sempre por
 * cima: esconder ou renomear nunca dá acesso a quem não tinha.
 */

export type Secao = "operacao" | "gestao" | "divulgacao";
export const NOME_SECAO: Record<Secao, string> = { operacao: "Operação", gestao: "Gestão", divulgacao: "Divulgação" };

export interface ItemNav {
  id: string;
  /** Caminho dentro da empresa ("" é a Visão geral). */
  rota: string;
  nome: string;
  icone: NomeIcone;
  secao: Secao;
  emBreve?: boolean;
  /** No celular: fica na barra de baixo mesmo sendo do ramo, ou sai dela. */
  naBarra?: boolean;
  foraDaBarra?: boolean;
  doNegocio?: boolean;
}

/** Ramos que trabalham com hora marcada abrem na agenda. */
const ABREM_NA_AGENDA: Perfil[] = ["consultorio"];

export function telaInicialPadrao(perfil: Perfil) {
  return ABREM_NA_AGENDA.includes(perfil) ? "agenda" : "inicio";
}

interface Entrada {
  perfil: Perfil;
  papel: Papel;
  modulos: Set<Modulo>;
  config?: { menu: ItemMenuEmpresa[] | null; telaInicial: string | null } | null;
}

/** Todos os itens que o ramo oferece, na ordem padrão, sem olhar a configuração da empresa. */
export function itensDoRamo({ perfil, papel, modulos }: Omit<Entrada, "config">): ItemNav[] {
  const pacote = pacoteDe(perfil);
  const temAgenda = pacote.abas.some((a) => a.rota === "agenda");
  const podeVer = (a: Acao) => pode(papel, a);
  const itens: (ItemNav | false)[] = [
    podeVer("ver_painel") && { id: "inicio", rota: "", nome: "Visão geral", icone: "inicio", secao: "operacao" },
    // Consultório: a agenda logo abaixo da Visão geral; nos outros ramos ela vem com as abas do pacote.
    ...(perfil === "consultorio"
      ? pacote.abas.filter((a) => a.rota === "agenda").map((a) => podeVer("ver_clientes") && ({ id: a.id, rota: a.rota!, nome: a.titulo, icone: a.icone, secao: "operacao" as const, naBarra: true }))
      : []),
    podeVer("ver_lancamentos") && { id: "vendas", rota: "vendas", nome: pacote.vocab.vendas, icone: "vendas", secao: "operacao" },
    podeVer("ver_clientes") && { id: "clientes", rota: "clientes", nome: pacote.vocab.clientes, icone: "clientes", secao: "operacao" },
    modulos.has("whatsapp") && podeVer("ver_clientes") && { id: "whatsapp", rota: "whatsapp", nome: "WhatsApp", icone: "whatsapp", secao: "operacao" },
    ...pacote.abas
      .filter((a) => perfil !== "consultorio" || a.rota !== "agenda")
      .map(
        (a) =>
          (a.rota !== "agenda" || podeVer("ver_clientes")) && {
            id: a.id,
            rota: a.rota ?? `n/${a.id}`,
            nome: a.titulo,
            icone: a.icone,
            secao: "operacao" as const,
            emBreve: !a.rota,
            doNegocio: true,
            naBarra: a.rota === "agenda",
          },
      ),
    podeVer("ver_painel") && { id: "financeiro", rota: "financeiro", nome: "Financeiro", icone: "financeiro", secao: "gestao", foraDaBarra: temAgenda },
    podeVer("ver_painel") && { id: "impostos", rota: "financeiro#impostos", nome: "Impostos", icone: "documento", secao: "gestao", doNegocio: true },
    podeVer("lancar") && { id: "instagram", rota: "instagram", nome: "Instagram", icone: "instagram", secao: "divulgacao", doNegocio: true },
  ];
  return itens.filter((i): i is ItemNav => !!i);
}

/** O menu final: a ordem, os nomes e os escondidos da empresa aplicados sobre o do ramo. */
export function montarMenu(e: Entrada): ItemNav[] {
  const ramo = itensDoRamo(e);
  const escolhas = e.config?.menu ?? [];
  if (!escolhas.length) return ramo;
  const porId = new Map(ramo.map((i) => [i.id, i]));
  const vistos = new Set<string>();
  const ordenados: ItemNav[] = [];
  for (const c of escolhas) {
    const item = porId.get(c.id);
    if (!item || vistos.has(c.id)) continue;
    vistos.add(c.id);
    if (c.oculto) continue;
    ordenados.push({ ...item, nome: c.nome?.trim() || item.nome });
  }
  // Itens novos (um módulo ligado depois) entram no fim da seção deles.
  for (const item of ramo) if (!vistos.has(item.id)) ordenados.push(item);
  return ordenados;
}

/** Para onde a pessoa vai ao entrar na empresa. Colaborador sempre cai nas vendas. */
export function rotaInicial(empresaId: string, papel: Papel, perfil: Perfil, config?: { telaInicial: string | null; menu: ItemMenuEmpresa[] | null } | null, modulos?: Set<Modulo>) {
  if (papel === "colaborador") return `/${empresaId}/vendas`;
  const alvo = config?.telaInicial ?? telaInicialPadrao(perfil);
  if (alvo === "inicio") return `/${empresaId}`;
  const item = itensDoRamo({ perfil, papel, modulos: modulos ?? new Set() }).find((i) => i.id === alvo && !i.emBreve);
  return item ? `/${empresaId}/${item.rota}` : `/${empresaId}`;
}

export { ESPECIALIDADES, type Especialidade, especialidadeValida } from "@/pacotes/catalogo";
