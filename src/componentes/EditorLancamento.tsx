import { obterDb } from "@/db";
import { centavosParaInput } from "@/lib/dinheiro";
import { hoje } from "@/lib/datas";
import { podeAlterarLancamento } from "@/lib/permissoes";
import { opcoesDeClientes } from "@/lib/servidor/clientes";
import { listarCategorias, listarFontes, obterDespesa, obterVenda } from "@/lib/servidor/lancamentos";
import { editarDespesa, editarVenda, excluirLancamento, restaurarLancamento } from "@/app/[empresaId]/acoes";
import { exigirAcesso } from "@/servidor/acesso";
import { AvisoPagina, EditarLancamento } from "./editar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Destinos {
  /** Endereço da tela, sem os parâmetros de edição, com os filtros que valem. */
  fechar: string;
  aposSalvar: string;
  aposExcluir: string;
}

/** Abre a janela de edição quando o endereço traz ?editar=<id>. Sem permissão ou sem o lançamento, não mostra nada. */
export async function EditorLancamento({ empresaId, tipo, id, ...destinos }: { empresaId: string; tipo: "venda" | "despesa"; id?: string } & Destinos) {
  if (!id || !UUID.test(id)) return null;
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const l = tipo === "venda" ? await obterVenda(ctx, id) : await obterDespesa(ctx, id);
  if (!l || !podeAlterarLancamento(ctx.papel, ctx.usuario.id, l.criadoPor)) return null;
  const [todasFontes, todasCategorias, clientes] = await Promise.all([listarFontes(empresaId, false), listarCategorias(empresaId, false), opcoesDeClientes(obterDb(), empresaId)]);
  // Uma fonte ou categoria desativada depois do lançamento ainda precisa aparecer na lista.
  const fontes = todasFontes.filter((f) => f.ativo || ("fonteReceitaId" in l && f.id === l.fonteReceitaId));
  const categorias = todasCategorias.filter((c) => c.ativo || ("categoriaId" in l && c.id === l.categoriaId));
  const inicial: Record<string, string> =
    tipo === "venda" && "formaPagamento" in l
      ? { valor: centavosParaInput(l.valorCentavos), data: l.data, descricao: l.descricao, fonteReceitaId: l.fonteReceitaId, formaPagamento: l.formaPagamento, status: l.status, dataRecebimento: l.dataRecebimento, clienteId: l.clienteId ?? "" }
      : "categoriaId" in l
        ? { valor: centavosParaInput(l.valorCentavos), data: l.data, descricao: l.descricao, categoriaId: l.categoriaId, status: l.status, vencimento: l.vencimento, pagoEm: l.pagoEm ?? "" }
        : {};
  return (
    <EditarLancamento
      key={id}
      tipo={tipo}
      inicial={inicial}
      hoje={hoje()}
      fontes={fontes.map((f) => ({ id: f.id, nome: f.nome }))}
      categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      editar={(tipo === "venda" ? editarVenda : editarDespesa).bind(null, empresaId, id)}
      excluir={excluirLancamento.bind(null, empresaId, tipo, id)}
      {...destinos}
    />
  );
}

/** Aviso depois de salvar (?salvo=1) ou excluir (?excluida=<id>, com o botão "Desfazer"). */
export function AvisoLancamento({ empresaId, tipo, salvo, excluida, limpar }: { empresaId: string; tipo: "venda" | "despesa"; salvo?: string; excluida?: string; limpar: string }) {
  if (excluida && UUID.test(excluida))
    return <AvisoPagina key={excluida} texto={tipo === "venda" ? "Venda excluída." : "Despesa excluída."} desfazer={restaurarLancamento.bind(null, empresaId, tipo, excluida)} limpar={limpar} />;
  if (salvo) return <AvisoPagina key="salvo" texto="Alterações salvas." limpar={limpar} />;
  return null;
}
