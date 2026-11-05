import Link from "next/link";
import { obterDb } from "@/db";
import { participacaoPorFonte } from "@/lib/calculos/painel";
import { diasNoMes, formatarDataCurta, hoje, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { pode, podeAlterarLancamento } from "@/lib/permissoes";
import { NOME_FORMA } from "@/lib/rotulos";
import { listarParaConferir } from "@/lib/servidor/conferencia";
import { marcarVendaRecebida } from "@/lib/servidor/acoes-lancamentos";
import { listarVendasDoMes } from "@/lib/servidor/lancamentos";
import { exigirAcesso } from "@/servidor/acesso";
import { BotaoLancar } from "@/componentes/BotaoLancar";
import { AvisoLancamento, EditorLancamento } from "@/componentes/EditorLancamento";
import { Icone } from "@/componentes/Icone";
import { SeletorMes, Topo, endereco } from "@/componentes/Topo";
import { porcento, reais, reaisCurto } from "@/componentes/formato";
import { BotaoAcao, BotaoConferir, Contador, Entrada, GraficoBarras } from "@/componentes/vivos";
import { conferir } from "../acoes";

export const metadata = { title: "Vendas" };
export const dynamic = "force-dynamic";

const SITUACOES = [
  { id: "", nome: "Todas" },
  { id: "conferir", nome: "Para conferir" },
  { id: "a_receber", nome: "A receber" },
  { id: "recebido", nome: "Recebidas" },
] as const;

export default async function Vendas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string; fonte?: string; ver?: string; q?: string; ate?: string; editar?: string; salvo?: string; excluida?: string }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const atual = mesAtual();
  const mes = mesValido(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const podeConferir = pode(ctx.papel, "conferir");
  const [todas, pendentes] = await Promise.all([listarVendasDoMes(ctx, mes), podeConferir ? listarParaConferir(obterDb(), empresaId) : []]);
  const aConferir = new Set(pendentes.map((p) => p.id));
  const veTudo = pode(ctx.papel, "ver_todos_lancamentos");
  const base = `/${empresaId}/vendas`;
  const ver = SITUACOES.some((s) => s.id === sp.ver) ? sp.ver! : "";
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtros: Record<string, string | undefined> = { mes: mes === atual ? undefined : mes, fonte: sp.fonte, ver, q: sp.q };
  const link = (mudar: Partial<typeof filtros>) => endereco(base, { ...filtros, ...mudar });

  // Os números do topo e o gráfico olham o mês inteiro; a tabela respeita os filtros.
  const total = todas.reduce((s, v) => s + v.valor, 0);
  const aReceber = todas.filter((v) => v.status === "a_receber").reduce((s, v) => s + v.valor, 0);
  const porFonte = new Map<string, { id: string; nome: string; valor: number }>();
  for (const v of todas) {
    const f = porFonte.get(v.fonteId) ?? { id: v.fonteId, nome: v.fonte, valor: 0 };
    f.valor += v.valor;
    porFonte.set(v.fonteId, f);
  }
  const fontes = participacaoPorFonte([...porFonte.values()]);
  const dias = mes === atual ? Number(hoje().slice(8)) : diasNoMes(mes);
  const porDia = Array.from({ length: dias }, () => 0);
  for (const v of todas) porDia[Number(v.data.slice(8)) - 1] += v.valor;
  const melhorDia = porDia.indexOf(Math.max(...porDia));

  const lista = todas.filter(
    (v) =>
      (!sp.fonte || v.fonteId === sp.fonte) &&
      (ver === "" || (ver === "conferir" ? aConferir.has(v.id) : v.status === ver)) &&
      (!q || `${v.descricao} ${v.fonte} ${v.autor ?? ""}`.toLowerCase().includes(q)),
  );
  const somaLista = lista.reduce((s, v) => s + v.valor, 0);
  // Mês cheio passa de centenas de vendas: mostra de 50 em 50.
  const ate = Math.max(50, Math.min(Number(sp.ate) || 50, 5000));
  const visiveis = lista.slice(0, ate);

  return (
    <>
      <Topo titulo="Vendas" sub={`${nomeDoMes(mes)}${mes === atual ? ", até hoje" : ""}${veTudo ? "" : " · só as que você lançou"}`}>
        <div className="topo-acoes">
          <SeletorMes mes={mes} atual={atual} link={(m) => link({ mes: m === atual ? undefined : m })} />
          <a className="botao-claro" href={`/${empresaId}/exportar?tipo=vendas&mes=${mes}`}>
            Exportar CSV
          </a>
          <BotaoLancar empresaId={empresaId} />
        </div>
      </Topo>

      <EditorLancamento
        empresaId={empresaId}
        tipo="venda"
        id={sp.editar}
        fechar={link({})}
        aposSalvar={link({ salvo: "1" })}
        aposExcluir={link({ excluida: sp.editar })}
      />
      <AvisoLancamento empresaId={empresaId} tipo="venda" salvo={sp.salvo} excluida={sp.excluida} limpar={link({})} />

      <Entrada className="grade">
        <section className="cartao c3">
          <h2>{veTudo ? "Total vendido" : "Total que você lançou"}</h2>
          <Contador className="grande" valor={total} />
          <p className="nota">{todas.length === 1 ? "1 venda" : `${todas.length} vendas`} no mês</p>
        </section>
        <section className="cartao c3">
          <h2>Ticket médio</h2>
          <Contador className="grande" valor={todas.length ? Math.round(total / todas.length) : 0} />
          <p className="nota">Quanto cada venda trouxe, em média.</p>
        </section>
        <section className="cartao c3">
          <h2>A receber</h2>
          <Contador className="grande" valor={aReceber} />
          <p className="nota">{aReceber ? "Vendas a prazo que ainda não entraram no caixa." : "Tudo o que foi vendido já entrou."}</p>
        </section>
        <section className="cartao c3">
          <h2>Falta conferir</h2>
          <Contador className={`grande ${pendentes.length ? "ruim" : ""}`} valor={pendentes.length} formato="inteiro" />
          <p className="nota">{pendentes.length ? "Entraram sozinhas pelo WhatsApp ou pelo site." : "Tudo o que entrou sozinho já foi visto."}</p>
        </section>

        <section className="cartao c8">
          <header className="cartao-topo">
            <h2>Vendas por dia</h2>
            {porDia[melhorDia] > 0 && (
              <span className="nota">
                Melhor dia: {melhorDia + 1}/{mes.slice(5)} · {reaisCurto(porDia[melhorDia])}
              </span>
            )}
          </header>
          {total > 0 ? <GraficoBarras rotulos={porDia.map((_, i) => String(i + 1))} valores={porDia} destaque={melhorDia} /> : <p className="vazio">Nenhuma venda em {nomeDoMes(mes)}.</p>}
        </section>
        <section className="cartao c4">
          <h2>Por fonte</h2>
          {fontes.length ? (
            <ul className="lista-simples">
              {fontes.map((f) => (
                <li key={f.id}>
                  <Link className="link" href={link({ fonte: sp.fonte === f.id ? undefined : f.id })} aria-current={sp.fonte === f.id ? "true" : undefined}>
                    {f.nome}
                  </Link>
                  <span className="nota">{porcento(f.participacao, 1)}</span>
                  <strong>{reaisCurto(f.valor)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vazio">Sem vendas no mês.</p>
          )}
          <p className="nota">Toque numa fonte para ver só as vendas dela.</p>
        </section>

        <section className="cartao c12">
          <form className="filtros filtros-dentro" role="search">
            {filtros.mes && <input type="hidden" name="mes" value={filtros.mes} />}
            {sp.fonte && <input type="hidden" name="fonte" value={sp.fonte} />}
            {ver && <input type="hidden" name="ver" value={ver} />}
            <label className="campo-busca">
              <Icone nome="busca" />
              <span className="oculto">Buscar venda</span>
              <input name="q" defaultValue={sp.q} placeholder="Buscar por descrição, fonte ou quem lançou" />
            </label>
            <nav className="alternar" aria-label="Situação">
              {SITUACOES.filter((s) => s.id !== "conferir" || podeConferir).map((s) => (
                <Link key={s.id} href={link({ ver: s.id || undefined })} aria-current={ver === s.id ? "page" : undefined}>
                  {s.nome}
                  {s.id === "conferir" && pendentes.length ? ` · ${pendentes.length}` : ""}
                </Link>
              ))}
            </nav>
            {sp.fonte && (
              <Link className="pilula pilula-botao" href={link({ fonte: undefined })}>
                {porFonte.get(sp.fonte)?.nome ?? "Fonte"} ×
              </Link>
            )}
          </form>
          {lista.length ? (
            <div className="tabela-rolar">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Venda</th>
                    <th>Fonte</th>
                    <th>Pagamento</th>
                    <th>{veTudo ? "Lançou" : "Situação"}</th>
                    <th className="num">Valor</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((v) => {
                    const pendente = aConferir.has(v.id);
                    return (
                      <tr key={v.id} className={pendente ? "pendente" : ""}>
                        <td>{formatarDataCurta(v.data)}</td>
                        <td>
                          {v.descricao || v.fonte}
                          {v.status === "a_receber" && <span className="nota"> · a receber em {formatarDataCurta(v.dataRecebimento ?? v.data)}</span>}
                        </td>
                        <td>{v.fonte}</td>
                        <td>{NOME_FORMA[v.formaPagamento]}</td>
                        <td>{veTudo ? (v.autor?.split(" ")[0] ?? "Automático") : v.status === "recebido" ? "Recebida" : "A receber"}</td>
                        <td className="num">{reais(v.valor, true)}</td>
                        <td className="num">
                          <span className="acoes-linha">
                            {pendente ? (
                              <BotaoConferir acao={conferir.bind(null, empresaId, v.id)} />
                            ) : v.status === "a_receber" && podeAlterarLancamento(ctx.papel, ctx.usuario.id, v.criadoPor) ? (
                              <BotaoAcao acao={marcarVendaRecebida.bind(null, empresaId, v.id)} rotulo="Recebi" sumir={false} />
                            ) : null}
                            {podeAlterarLancamento(ctx.papel, ctx.usuario.id, v.criadoPor) && (
                              <Link className="link-editar" href={link({ editar: v.id })} scroll={false} aria-label={`Editar venda de ${reais(v.valor, true)}`}>
                                Editar
                              </Link>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="nota">
                      {lista.length === todas.length ? `${lista.length} vendas` : `${lista.length} de ${todas.length} vendas`}
                    </td>
                    <td className="num">
                      <strong>{reais(somaLista, true)}</strong>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              {lista.length > ate && (
                <p className="mais">
                  <Link className="botao-claro" href={link({ ate: String(ate + 100) })} scroll={false}>
                    Mostrar mais {Math.min(100, lista.length - ate)} de {lista.length - ate} restantes
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <p className="vazio">{todas.length ? "Nenhuma venda com esses filtros." : `Nenhuma venda em ${nomeDoMes(mes)}.`}</p>
          )}
        </section>
      </Entrada>
    </>
  );
}
