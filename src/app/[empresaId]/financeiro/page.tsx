import Link from "next/link";
import { obterDb } from "@/db";
import { formatarDataCurta, hoje, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { pode, podeAlterarLancamento } from "@/lib/permissoes";
import { NOME_TIPO_DIVIDA } from "@/lib/textos-dividas";
import { pagarParcela } from "@/lib/servidor/acoes-dividas";
import { pagarFolha } from "@/lib/servidor/acoes-funcionarios";
import { marcarDespesaPaga, marcarVendaRecebida } from "@/lib/servidor/acoes-lancamentos";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
import { type Conta, type Grupo, grupoDe, listarContas } from "@/lib/servidor/contas";
import { listarDividas, parcelasDoMes } from "@/lib/servidor/dividas";
import { impostoDoMes } from "@/lib/servidor/fiscal";
import { folhaDoMes } from "@/lib/servidor/folha";
import { listarDespesasDoMes } from "@/lib/servidor/lancamentos";
import { exigirAcesso } from "@/servidor/acesso";
import { BotaoLancar } from "@/componentes/BotaoLancar";
import { AvisoLancamento, EditorLancamento } from "@/componentes/EditorLancamento";
import { Icone } from "@/componentes/Icone";
import { SeletorMes, Topo, endereco } from "@/componentes/Topo";
import { porcento, reais, reaisCurto } from "@/componentes/formato";
import { BarrasLista, BotaoAcao, Contador, Entrada } from "@/componentes/vivos";

export const metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

const GRUPOS: { g: Grupo; titulo: string }[] = [
  { g: "atrasadas", titulo: "Atrasadas" },
  { g: "hoje", titulo: "Vencem hoje" },
  { g: "semana", titulo: "Próximos 7 dias" },
  { g: "mes", titulo: "Até 30 dias" },
];
const VER = [
  { id: "pagar", nome: "A pagar" },
  { id: "receber", nome: "A receber" },
  { id: "tudo", nome: "Tudo" },
] as const;
const NOME_REGIME = { mei: "MEI", simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real" } as const;

export default async function Financeiro({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ mes?: string; ver?: string; editar?: string; salvo?: string; excluida?: string }> }) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_painel");
  const { empresa, papel } = ctx;
  const atual = mesAtual();
  const mes = mesValido(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const ver = VER.find((v) => v.id === sp.ver)?.id ?? "pagar";
  const db = obterDb();
  const hojeData = hoje();
  await prepararEmpresa(db, empresa, mes, atual);
  const [contas, despesas, folha, parcelas, dividas, { imposto }] = await Promise.all([
    listarContas(db, empresaId, hojeData),
    listarDespesasDoMes(ctx, mes),
    folhaDoMes(db, empresaId, mes),
    parcelasDoMes(db, empresaId, mes),
    listarDividas(db, empresaId, mes, hojeData),
    impostoDoMes(db, empresa, mes),
  ]);
  const gerencia = pode(papel, "gerenciar");
  const base = `/${empresaId}/financeiro`;
  const filtros = { mes: mes === atual ? undefined : mes, ver: ver === "pagar" ? undefined : ver };
  const soma = (lista: Conta[], sentido: Conta["sentido"]) => lista.filter((c) => c.sentido === sentido).reduce((s, c) => s + c.valor, 0);
  const atrasadas = contas.filter((c) => c.data < hojeData && c.sentido === "pagar");

  // Despesas do mês: as lançadas que entram no lucro, mais a folha e os juros das dívidas.
  const porCategoria = new Map<string, { nome: string; valor: number }>();
  for (const d of despesas.filter((d) => d.entraNoLucro)) {
    const c = porCategoria.get(d.categoriaId) ?? { nome: d.categoria, valor: 0 };
    c.valor += d.valor;
    porCategoria.set(d.categoriaId, c);
  }
  const custoFolha = folha.reduce((s, f) => s + f.linha.custoTotal, 0);
  const juros = parcelas.reduce((s, p) => s + p.parcela.juros, 0);
  if (custoFolha) porCategoria.set("folha", { nome: "Folha de pagamento", valor: custoFolha });
  if (juros) porCategoria.set("juros", { nome: "Juros de dívidas", valor: juros });
  const categorias = [...porCategoria.values()].sort((a, b) => b.valor - a.valor);
  const totalDespesas = categorias.reduce((s, c) => s + c.valor, 0);
  const soCaixa = despesas.filter((d) => !d.entraNoLucro).reduce((s, d) => s + d.valor, 0);
  const saldoDividas = dividas.reduce((s, d) => s + d.saldoDevedor, 0);

  const acao = (c: Conta) => {
    if (!gerencia) return null;
    const a =
      c.tipo === "despesa"
        ? marcarDespesaPaga.bind(null, empresaId, c.id)
        : c.tipo === "folha"
          ? pagarFolha.bind(null, empresaId, c.id, undefined)
          : c.tipo === "parcela"
            ? pagarParcela.bind(null, empresaId, c.id)
            : marcarVendaRecebida.bind(null, empresaId, c.id);
    return <BotaoAcao acao={a} rotulo={c.sentido === "pagar" ? "Paguei" : "Recebi"} />;
  };

  return (
    <>
      <Topo titulo="Financeiro" sub={`Contas, despesas, impostos e dívidas · ${empresa.nome}`}>
        <div className="topo-acoes">
          <SeletorMes mes={mes} atual={atual} link={(m) => endereco(base, { ...filtros, mes: m === atual ? undefined : m })} />
          <a className="botao-claro" href={`/${empresaId}/exportar?tipo=despesas&mes=${mes}`}>
            Exportar CSV
          </a>
          <BotaoLancar empresaId={empresaId} inicial="despesa" />
        </div>
      </Topo>

      <EditorLancamento
        empresaId={empresaId}
        tipo="despesa"
        id={sp.editar}
        fechar={endereco(base, filtros)}
        aposSalvar={endereco(base, { ...filtros, salvo: "1" })}
        aposExcluir={endereco(base, { ...filtros, excluida: sp.editar })}
      />
      <AvisoLancamento empresaId={empresaId} tipo="despesa" salvo={sp.salvo} excluida={sp.excluida} limpar={endereco(base, filtros)} />

      {atrasadas.length > 0 && (
        <p className="faixa-alerta" role="status">
          <Icone nome="alerta" />
          {atrasadas.length === 1 ? "1 conta atrasada" : `${atrasadas.length} contas atrasadas`} somando {reais(soma(atrasadas, "pagar"))}.
        </p>
      )}

      <Entrada className="grade">
        <section className="cartao c3">
          <h2>A pagar em 30 dias</h2>
          <Contador className="grande" valor={soma(contas, "pagar")} />
          <p className="nota">Despesas, guias, folha e parcelas em aberto.</p>
        </section>
        <section className="cartao c3">
          <h2>A receber em 30 dias</h2>
          <Contador className="grande" valor={soma(contas, "receber")} />
          <p className="nota">Vendas a prazo que ainda vão entrar.</p>
        </section>
        <section className="cartao c3">
          <h2>Despesas de {nomeDoMes(mes).split(" ")[0]}</h2>
          <Contador className="grande" valor={totalDespesas} />
          <p className="nota">{soCaixa ? `Mais ${reaisCurto(soCaixa)} que só saíram do caixa (retiradas, compras de bens).` : "Tudo o que entra na conta do lucro."}</p>
        </section>
        <section className="cartao c3">
          <h2>Impostos estimados</h2>
          {imposto.total == null ? <p className="grande">—</p> : <Contador className="grande" valor={imposto.total} />}
          <p className="nota">{NOME_REGIME[empresa.regime]} · confirme com o seu contador.</p>
        </section>

        <section className="cartao c7">
          <header className="cartao-topo">
            <h2>Contas</h2>
            <nav className="alternar" aria-label="Mostrar">
              {VER.map((v) => (
                <Link key={v.id} href={endereco(base, { ...filtros, ver: v.id === "pagar" ? undefined : v.id })} aria-current={ver === v.id ? "page" : undefined} scroll={false}>
                  {v.nome}
                </Link>
              ))}
            </nav>
          </header>
          {GRUPOS.map(({ g, titulo }) => {
            const lista = contas.filter((c) => grupoDe(c.data, hojeData) === g && (ver === "tudo" || c.sentido === ver));
            if (!lista.length) return null;
            return (
              <div key={g} className={`grupo-contas ${g === "atrasadas" ? "grupo-atrasado" : ""}`}>
                <h3>
                  {titulo}
                  <span className="nota">{reais(soma(lista, "pagar") + soma(lista, "receber"))}</span>
                </h3>
                <ul className="lista-contas">
                  {lista.map((c) => (
                    <li key={`${c.tipo}-${c.id}`} className={g === "atrasadas" ? "atrasado" : ""}>
                      <span className={`pilula ${c.sentido === "pagar" ? "pilula-pagar" : "pilula-receber"}`}>{c.sentido === "pagar" ? "Pagar" : "Receber"}</span>
                      <div>
                        <p>{c.descricao}</p>
                        <p className="nota">
                          {formatarDataCurta(c.data)} · {c.detalhe}
                        </p>
                      </div>
                      <strong className={c.sentido === "pagar" ? "" : "bom"}>
                        {c.sentido === "pagar" ? "−" : "+"}
                        {reais(c.valor, true)}
                      </strong>
                      {acao(c)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!contas.some((c) => ver === "tudo" || c.sentido === ver) && <p className="vazio">Nada em aberto nos próximos 30 dias.</p>}
          <p className="nota">Os vencimentos não consideram feriados. Guias de impostos são estimativas.</p>
        </section>

        <section className="cartao c5">
          <h2>Para onde foi o dinheiro</h2>
          {categorias.length ? (
            <>
              <BarrasLista linhas={categorias} />
              <p className="nota">
                Maior gasto: {categorias[0].nome}, {porcento(Math.round((categorias[0].valor / totalDespesas) * 100_000))} das despesas do mês.
              </p>
            </>
          ) : (
            <p className="vazio">Nenhuma despesa em {nomeDoMes(mes)}.</p>
          )}
        </section>

        <section className="cartao c6">
          <h2>Impostos de {nomeDoMes(mes)}</h2>
          {imposto.regime === "simples" ? (
            <ul className="lista-simples">
              {imposto.simples.parcelas.map((p) => (
                <li key={p.natureza}>
                  <span>
                    {p.natureza === "comercio" ? "Comércio" : "Serviços"} · Anexo {p.anexo}
                    <span className="nota"> · alíquota efetiva {porcento(p.aliquotaEfetiva, 2)}</span>
                  </span>
                  <strong>{reais(p.imposto, true)}</strong>
                </li>
              ))}
              <li>
                <span>Faturamento dos últimos 12 meses</span>
                <strong>{reaisCurto(imposto.simples.rbt12.valor)}</strong>
              </li>
            </ul>
          ) : imposto.regime === "presumido" ? (
            <ul className="lista-simples">
              {imposto.presumido.linhas.map((l) => (
                <li key={l.chave}>
                  <span>
                    {l.nome}
                    <span className="nota"> · {porcento(l.aliquota, 2)}</span>
                  </span>
                  <strong>{reais(l.valor, true)}</strong>
                </li>
              ))}
            </ul>
          ) : imposto.regime === "mei" ? (
            <ul className="lista-simples">
              <li>
                <span>DAS do mês</span>
                <strong>{reais(imposto.mei.das, true)}</strong>
              </li>
              <li>
                <span>Faturado no ano</span>
                <strong>{reaisCurto(imposto.mei.faturamentoAno)}</strong>
              </li>
              <li>
                <span>Uso do limite do MEI</span>
                <strong>{porcento(imposto.mei.usoDoLimite, 1)}</strong>
              </li>
            </ul>
          ) : (
            <p className="vazio">{imposto.regime === "erro" ? imposto.mensagem : "Cálculo do Lucro Real em breve. Consulte o seu contador."}</p>
          )}
          <p className="nota">Estimativa feita com o que foi lançado. O valor certo é o da guia.</p>
        </section>

        <section className="cartao c6">
          <header className="cartao-topo">
            <h2>Dívidas</h2>
            <span className="nota">Saldo devedor {reais(saldoDividas)}</span>
          </header>
          {dividas.length ? (
            <ul className="lista-simples">
              {dividas.map((d) => (
                <li key={d.id}>
                  <span>
                    {d.credor}
                    <span className="nota">
                      {" "}
                      · {NOME_TIPO_DIVIDA[d.tipo]} · {d.parcelasPagas} de {d.parcelasTotal} pagas
                      {d.proximoVencimento ? ` · próxima ${formatarDataCurta(d.proximoVencimento)}` : ""}
                    </span>
                    {d.atrasadas > 0 && <span className="pilula pilula-pagar"> {d.atrasadas} atrasada{d.atrasadas > 1 ? "s" : ""}</span>}
                  </span>
                  <strong>{reais(d.saldoDevedor)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vazio">Nenhuma dívida cadastrada.</p>
          )}
        </section>

        <section className="cartao c12">
          <header className="cartao-topo">
            <h2>Despesas lançadas em {nomeDoMes(mes)}</h2>
            <span className="nota">{despesas.length ? `${despesas.length} ${despesas.length === 1 ? "lançamento" : "lançamentos"}` : ""}</span>
          </header>
          {despesas.length ? (
            <div className="tabela-rolar">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Despesa</th>
                    <th>Categoria</th>
                    <th>Situação</th>
                    <th className="num">Valor</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {[...despesas]
                    .sort((a, b) => b.data.localeCompare(a.data))
                    .slice(0, 100)
                    .map((d) => (
                      <tr key={d.id}>
                        <td>{formatarDataCurta(d.data)}</td>
                        <td>{d.descricao || d.categoria}</td>
                        <td>{d.categoria}</td>
                        <td>{d.status === "pago" ? "Paga" : `A pagar até ${formatarDataCurta(d.vencimento)}`}</td>
                        <td className="num">{reais(d.valor, true)}</td>
                        <td className="num">
                          {podeAlterarLancamento(papel, ctx.usuario.id, d.criadoPor) && (
                            <Link className="link-editar" href={endereco(base, { ...filtros, editar: d.id })} scroll={false} aria-label={`Editar despesa de ${reais(d.valor, true)}`}>
                              Editar
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {despesas.length > 100 && <p className="nota">Mostrando as 100 mais recentes. O CSV leva todas.</p>}
            </div>
          ) : (
            <p className="vazio">Nenhuma despesa lançada em {nomeDoMes(mes)}.</p>
          )}
        </section>

        {folha.length > 0 && (
          <section className="cartao c12">
            <h2>Folha de {nomeDoMes(mes)}</h2>
            <div className="tabela-rolar">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Cargo</th>
                    <th className="num">Sai do caixa</th>
                    <th className="num">Custo total</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {folha.map((f) => (
                    <tr key={f.linha.id}>
                      <td>{f.nome}</td>
                      <td>{f.cargo}</td>
                      <td className="num">{reais(f.linha.valorCaixa, true)}</td>
                      <td className="num">{reais(f.linha.custoTotal, true)}</td>
                      <td>{f.linha.status === "pago" ? "Paga" : `A pagar até ${formatarDataCurta(f.linha.vencimento)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Entrada>
    </>
  );
}
