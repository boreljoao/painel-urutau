import "server-only";
import { obterDb } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { type Perfil, auditoria, categoriasDespesa, empresaUsuarios, empresas } from "@/db/schema";
import { errosPorCampo, esquemaEmpresa } from "@/lib/validacao";
import { PACOTES } from "@/pacotes/catalogo";

export interface DadosEmpresaNova {
  nome: string;
  perfil: Perfil;
  regime: "mei" | "simples" | "presumido" | "nao_sei";
  cidade?: string;
  uf?: string;
}

/**
 * Cria a empresa já moldada ao pacote (categorias, fontes de receita, ponto de partida do imposto)
 * com a pessoa como dona. Usada por quem cria a própria empresa e pela demonstração.
 */
export async function montarEmpresa(usuarioId: string, d: DadosEmpresaNova): Promise<{ id: string } | { erro: string }> {
  const p = PACOTES[d.perfil];
  // "Não sei" começa no Simples, que é o regime da maioria das pequenas empresas; dá para trocar depois.
  const empresa = esquemaEmpresa.safeParse({
    nome: d.nome,
    atividade: p.fiscal.atividade,
    cidade: d.cidade ?? "",
    uf: d.uf ?? "",
    regime: d.regime === "nao_sei" ? "simples" : d.regime,
    anexoComercio: p.fiscal.anexoComercio ?? "",
    anexoServicos: p.fiscal.anexoServicos ?? "",
    sujeitoFatorR: p.fiscal.fatorR ? "on" : "",
    perfil: d.perfil,
  });
  if (!empresa.success) return { erro: Object.values(errosPorCampo(empresa.error))[0] ?? "Confira os dados." };

  const id = await obterDb().transaction(async (tx) => {
    const [e] = await tx.insert(empresas).values(empresa.data).returning({ id: empresas.id });
    await tx.insert(empresaUsuarios).values({ empresaId: e.id, usuarioId, papel: "dono" });
    await criarPadroesDaEmpresa(tx, e.id, empresa.data.atividade, d.perfil);
    if (p.categoriasExtras.length)
      await tx.insert(categoriasDespesa).values(p.categoriasExtras.map((c, i) => ({ empresaId: e.id, nome: c.nome, comportamento: c.comportamento, ordem: 20 + i })));
    // Dentro da transação: registrarAuditoria só aceita o banco, então grava direto.
    await tx.insert(auditoria).values({ empresaId: e.id, usuarioId, ator: "usuario", acao: "empresa.criar", entidade: "empresa", entidadeId: e.id, dados: { perfil: d.perfil, regime: d.regime } });
    return e.id;
  });
  return { id };
}
