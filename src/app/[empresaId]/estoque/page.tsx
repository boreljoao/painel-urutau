import Link from "next/link";
import { obterDb } from "@/db";
import { hoje } from "@/lib/datas";
import { NOME_SITUACAO, formatarQuantidade, margem } from "@/lib/estoque";
import { pode } from "@/lib/permissoes";
import { type FiltroProdutos, PRODUTOS_POR_PAGINA, categoriasDeProdutos, contarProdutos, listarProdutos, obterProduto, painelEstoque } from "@/lib/servidor/estoque";
import { exigirAcesso } from "@/servidor/acesso";
import { entradaAcao, perdaAcao, salvarProdutoAcao } from "@/pacotes/estoque-acoes";
import { JanelaProduto } from "@/pacotes/estoque-janela";
import { AoVivo } from "@/componentes/AoVivo";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { pulsoDaEmpresa } from "../pulso";

export const metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

const FILTROS: { id: FiltroProdutos; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "repor", nome: "Para repor" },
  { id: "sem_estoque", nome: "Sem estoque" },
  { id: "parados", nome: "Parados há 60 dias" },
  { id: "inativos", nome: "Inativos" },
];

const emReais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const qtdCampo = (mil: number) => String(mil / 1000).replace(".", ",");

export default async function Estoque({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ ver?: string; q?: string; novo?: string; editar?: string; pagina?: string }> }) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const podeLancar = pode(ctx.papel, "lancar");
  const filtro: FiltroProdutos = FILTROS.some((f) => f.id === sp.ver) ? (sp.ver as FiltroProdutos) : "todos";
  const db = obterDb();
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(sp.pagina ?? "1", 10) || 1));
  const [lista, total, resumo, categorias, editando] = await Promise.all([
    listarProdutos(db, empresaId, { busca: sp.q, filtro, pagina }),
    contarProdutos(db, empresaId, { busca: sp.q, filtro }),
    painelEstoque(db, empresaId),
    categoriasDeProdutos(db, empresaId),
    sp.editar && podeLancar ? obterProduto(db, empresaId, sp.editar) : null,
  ]);
  const base = `/${empresaId}/estoque`;
  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(
      Object.entries({ ver: filtro === "todos" ? undefined : filtro, q: sp.q, pagina: pagina > 1 ? String(pagina) : undefined, ...extra }).filter((e): e is [string, string] => !!e[1]),
    );
    return q.size ? `${base}?${q}` : base;
  };
  const fechar = link({});

  let janela: React.ReactNode = null;
  if (podeLancar && sp.novo)
    janela = <JanelaProduto titulo="Produto novo" salvar={salvarProdutoAcao.bind(null, empresaId, null)} inicial={{ unidade: "un", controlaEstoque: "on", codigoBarras: sp.novo !== "1" ? sp.novo : "" }} categorias={categorias} fechar={fechar} hoje={hoje()} />;
  else if (editando) {
    const p = editando.produto;
    janela = (
      <JanelaProduto
        titulo={p.nome}
        salvar={salvarProdutoAcao.bind(null, empresaId, p.id)}
        inicial={{
          nome: p.nome,
          codigoBarras: p.codigoBarras ?? "",
          sku: p.sku ?? "",
          categoria: p.categoria,
          unidade: p.unidade,
          preco: emReais(p.precoCentavos),
          minimo: p.minimoMil ? qtdCampo(p.minimoMil) : "",
          controlaEstoque: p.controlaEstoque ? "on" : "",
          ativo: p.ativo ? "on" : "",
        }}
        categorias={categorias}
        fechar={fechar}
        hoje={hoje()}
        edicao={{
          unidade: p.unidade,
          controla: p.controlaEstoque,
          saldo: formatarQuantidade(p.saldoMil, p.unidade),
          entrada: entradaAcao.bind(null, empresaId, p.id, p.unidade),
          perda: perdaAcao.bind(null, empresaId, p.id, p.unidade),
        }}
      />
    );
  }

  const margem30 = resumo.vendas30d.receita ? Math.round(((resumo.vendas30d.receita - resumo.vendas30d.custo) / resumo.vendas30d.receita) * 100) : null;

  return (
    <div className="estoque">
      <header className="agenda2-topo">
        <div>
          <h1>Estoque</h1>
          <p>
            {resumo.produtosAtivos} {resumo.produtosAtivos === 1 ? "produto" : "produtos"} · {reais(resumo.valorEmCusto)} em mercadoria (custo)
          </p>
        </div>
        <div className="topo-acoes">
          <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
          <Link className="botao-claro" href={`/${empresaId}/caixa`}>
            <Icone nome="vendas" /> Abrir caixa
          </Link>
          {podeLancar && (
            <Link className="botao" href={link({ novo: "1" })} scroll={false}>
              + Produto
            </Link>
          )}
        </div>
      </header>

      <section className="patio-resumo" aria-label="Resumo do estoque">
        <Link href={link({ ver: "repor", pagina: undefined, q: undefined })} className={`cartao ${resumo.repor ? "alerta" : ""}`}>
          <span>Para repor</span>
          <strong>{resumo.repor}</strong>
          <small>
            {resumo.abaixoMinimo} abaixo do mínimo · {resumo.semEstoque} {resumo.semEstoque === 1 ? "zerado" : "zerados"}
          </small>
        </Link>
        <div className={`cartao ${resumo.semEstoque ? "alerta" : ""}`}>
          <span>Sem estoque</span>
          <strong>{resumo.semEstoque}</strong>
        </div>
        <div className="cartao">
          <span>Vale na venda</span>
          <strong>{reais(resumo.valorEmVenda)}</strong>
        </div>
        <div className="cartao">
          <span>Parado há 60+ dias</span>
          <strong>{reais(resumo.valorParado)}</strong>
        </div>
        <div className="cartao">
          <span>Margem dos últimos 30 dias</span>
          <strong className="bom">{margem30 == null ? "—" : `${margem30}%`}</strong>
        </div>
      </section>

      <div className="estoque-barra">
        <nav className="agenda2-chips" aria-label="Filtrar">
          {FILTROS.map((f) => (
            <Link key={f.id} href={link({ ver: f.id === "todos" ? undefined : f.id, pagina: undefined })} className={`agenda2-chip${filtro === f.id ? " ativo" : ""}`}>
              {f.nome}
              {f.id === "repor" && resumo.repor ? <span className="chip-conta">{resumo.repor}</span> : null}
              {f.id === "sem_estoque" && resumo.semEstoque ? <span className="chip-conta">{resumo.semEstoque}</span> : null}
            </Link>
          ))}
        </nav>
        <form className="estoque-busca" action={base}>
          {filtro !== "todos" && <input type="hidden" name="ver" value={filtro} />}
          <Icone nome="busca" />
          <input name="q" defaultValue={sp.q} placeholder="Nome, código de barras ou SKU" aria-label="Buscar produto" />
        </form>
      </div>

      <section className="cartao">
        {lista.length ? (
          <div className="tabela-rolar">
            <table className="tabela estoque-tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Estoque</th>
                  <th className="num">Mínimo</th>
                  <th className="num">Preço</th>
                  <th className="num">Custo</th>
                  <th className="num">Margem</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const m = margem(p.precoCentavos, p.custoMedioCentavos);
                  return (
                    <tr key={p.id} className={`sit-${p.situacao}`}>
                      <td>
                        {podeLancar ? (
                          <Link href={link({ editar: p.id })} scroll={false}>
                            <strong>{p.nome}</strong>
                          </Link>
                        ) : (
                          <strong>{p.nome}</strong>
                        )}
                        <small>{[p.categoria, p.codigoBarras ?? p.sku].filter(Boolean).join(" · ")}</small>
                      </td>
                      <td className="num">{p.controlaEstoque ? formatarQuantidade(p.saldoMil, p.unidade) : "—"}</td>
                      <td className="num">{p.controlaEstoque && p.minimoMil ? formatarQuantidade(p.minimoMil, p.unidade) : "—"}</td>
                      <td className="num">{reais(p.precoCentavos, true)}</td>
                      <td className="num">{p.custoMedioCentavos ? reais(p.custoMedioCentavos, true) : "—"}</td>
                      <td className="num">{m == null || !p.custoMedioCentavos ? "—" : `${m.toLocaleString("pt-BR")}%`}</td>
                      <td>
                        <span className={`pilula sit-${p.situacao}`}>{NOME_SITUACAO[p.situacao]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {total > lista.length && (
              <nav className="estoque-paginas" aria-label="Páginas">
                <span>
                  Mostrando {(pagina - 1) * PRODUTOS_POR_PAGINA + 1}–{(pagina - 1) * PRODUTOS_POR_PAGINA + lista.length} de {total.toLocaleString("pt-BR")}
                </span>
                {pagina > 1 && (
                  <Link className="botao-claro" href={link({ pagina: pagina > 2 ? String(pagina - 1) : undefined })}>
                    Anteriores
                  </Link>
                )}
                {pagina * PRODUTOS_POR_PAGINA < total && (
                  <Link className="botao-claro" href={link({ pagina: String(pagina + 1) })}>
                    Próximos
                  </Link>
                )}
              </nav>
            )}
          </div>
        ) : (
          <div className="vazio-grande">
            <Icone nome="caixa" />
            <p>{sp.q ? `Nada encontrado para “${sp.q}”.` : filtro === "todos" ? "Nenhum produto cadastrado ainda. Cadastre com o código de barras para vender pelo leitor no caixa." : "Nenhum produto neste filtro."}</p>
            {podeLancar && filtro === "todos" && !sp.q && (
              <Link className="botao" href={link({ novo: "1" })} scroll={false}>
                + Produto
              </Link>
            )}
          </div>
        )}
      </section>
      {janela}
    </div>
  );
}
