import { obterDb } from "@/db";
import { hoje } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { opcoesDeClientes } from "@/lib/servidor/clientes";
import { listarCategorias, listarFontes } from "@/lib/servidor/lancamentos";
import { lancarDespesa, lancarVenda } from "@/app/[empresaId]/acoes";
import { exigirAcesso } from "@/servidor/acesso";
import { Lancar } from "./lancar";

/** Carrega fontes, categorias e clientes e mostra o botão "Lançar" (só para quem pode lançar). */
export async function BotaoLancar({ empresaId, inicial }: { empresaId: string; inicial?: "venda" | "despesa" }) {
  const { papel } = await exigirAcesso(empresaId);
  if (!pode(papel, "lancar")) return null;
  const [fontes, categorias, clientes] = await Promise.all([listarFontes(empresaId), listarCategorias(empresaId), opcoesDeClientes(obterDb(), empresaId)]);
  return (
    <Lancar
      inicial={inicial}
      hoje={hoje()}
      fontes={fontes.map((f) => ({ id: f.id, nome: f.nome }))}
      categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      lancarVenda={lancarVenda.bind(null, empresaId)}
      lancarDespesa={lancarDespesa.bind(null, empresaId)}
    />
  );
}
