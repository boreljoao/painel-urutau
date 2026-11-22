import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { obterDb } from "@/db";
import { clientes } from "@/db/schema";
import { centavosParaInput } from "@/lib/dinheiro";
import { hoje, mesAtual, mesValido, nomeDoMes, somarMeses } from "@/lib/datas";
import { NOME_SITUACAO_ALUGUEL, divisaoAluguel, proximoReajuste, situacaoAluguel, venceEm, vencimentoDoMes } from "@/lib/imobiliaria";
import { pode } from "@/lib/permissoes";
import { alugueisDoMes, listarContratos, opcoesDeImoveis } from "@/lib/servidor/imobiliaria";
import { exigirAcesso } from "@/servidor/acesso";
import { encerrarContratoAcao, receberAluguelAcao, repassarAluguelAcao, salvarContratoAcao } from "@/pacotes/imobiliaria-acoes";
import { JanelaContrato } from "@/pacotes/contrato-janela";
import { AoVivo } from "@/componentes/AoVivo";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { BotaoAcao } from "@/componentes/vivos";
import { pulsoDaEmpresa } from "../pulso";

export const metadata = { title: "Locações" };
export const dynamic = "force-dynamic";

const diaCurto = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const dataLonga = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export default async function Locacoes({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ mes?: string; novo?: string }> }) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const podeLancar = pode(ctx.papel, "lancar");
  const hj = hoje();
  const mes = mesValido(sp.mes) ? sp.mes : mesAtual();
  const db = obterDb();
  const [alugueis, contratos, imoveisOp, listaClientes] = await Promise.all([
    alugueisDoMes(db, empresaId, mes),
    listarContratos(db, empresaId),
    podeLancar && sp.novo ? opcoesDeImoveis(db, empresaId) : [],
    podeLancar && sp.novo ? db.select({ id: clientes.id, nome: clientes.nome }).from(clientes).where(and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm))).orderBy(asc(clientes.nome)) : [],
  ]);
  const base = `/${empresaId}/locacoes`;
  const linhas = alugueis.map((a) => {
    const venc = vencimentoDoMes(mes, a.diaVencimento);
    return { ...a, venc, situacao: situacaoAluguel(a.aluguel, venc, hj), repasse: a.aluguel.aluguelCentavos - a.aluguel.taxaAdmCentavos };
  });
  const soma = (f: (l: (typeof linhas)[number]) => boolean, v: (l: (typeof linhas)[number]) => number) => linhas.filter(f).reduce((s, l) => s + v(l), 0);
  const total = soma(() => true, (l) => l.aluguel.aluguelCentavos);
  const recebido = soma((l) => !!l.aluguel.recebidoEm, (l) => l.aluguel.aluguelCentavos);
  const atrasados = linhas.filter((l) => l.situacao === "atrasado");
  const aRepassar = soma((l) => l.situacao === "repassar", (l) => l.repasse);
  const taxaMes = soma((l) => !!l.aluguel.recebidoEm, (l) => l.aluguel.taxaAdmCentavos);
  const vencendo = contratos.filter((c) => venceEm(c.contrato.fim, hj) <= 90);

  return (
    <div className="locacoes">
      <header className="agenda2-topo">
        <div>
          <h1>Locações</h1>
          <p>
            {contratos.length} {contratos.length === 1 ? "contrato ativo" : "contratos ativos"} · {reais(contratos.reduce((s, c) => s + c.contrato.aluguelCentavos, 0))} em aluguéis por mês
          </p>
        </div>
        <div className="topo-acoes">
          <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
          {podeLancar && (
            <Link className="botao" href={`${base}?novo=1${sp.mes ? `&mes=${mes}` : ""}`} scroll={false}>
              + Contrato
            </Link>
          )}
        </div>
      </header>

      <section className="patio-resumo" aria-label={`Aluguéis de ${nomeDoMes(mes)}`}>
        <div className="cartao">
          <span>Aluguéis do mês</span>
          <strong>{reais(total)}</strong>
          <small>
            {reais(recebido)} recebidos ({total ? Math.round((recebido / total) * 100) : 0}%)
          </small>
        </div>
        <div className={`cartao ${atrasados.length ? "alerta" : ""}`}>
          <span>Atrasados</span>
          <strong className={atrasados.length ? "ruim" : ""}>{atrasados.length}</strong>
          <small>{reais(atrasados.reduce((s, l) => s + l.aluguel.aluguelCentavos, 0))}</small>
        </div>
        <div className={`cartao ${aRepassar ? "alerta" : ""}`}>
          <span>A repassar aos proprietários</span>
          <strong>{reais(aRepassar)}</strong>
        </div>
        <div className="cartao">
          <span>Taxa de administração</span>
          <strong className="bom">{reais(taxaMes)}</strong>
          <small>Receita da imobiliária no mês</small>
        </div>
      </section>

      <section className="cartao">
        <header className="cartao-topo">
          <h2>Aluguéis de {nomeDoMes(mes)}</h2>
          <nav className="mes-nav" aria-label="Mês">
            <Link className="botao-claro" href={`${base}?mes=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
              ‹
            </Link>
            {mes !== mesAtual() && (
              <Link className="botao-claro" href={base}>
                Este mês
              </Link>
            )}
            <Link className="botao-claro" href={`${base}?mes=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
              ›
            </Link>
          </nav>
        </header>
        {linhas.length ? (
          <div className="tabela-rolar">
            <table className="tabela locacao-tabela">
              <thead>
                <tr>
                  <th>Imóvel e inquilino</th>
                  <th>Vence</th>
                  <th className="num">Aluguel</th>
                  <th className="num">Taxa</th>
                  <th className="num">Repasse</th>
                  <th>Situação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.aluguel.id} className={`aluguel-${l.situacao}`}>
                    <td>
                      <strong>
                        {l.imovelCodigo} · {l.imovelTitulo}
                      </strong>
                      <small>
                        {l.inquilino}
                        {l.proprietario ? ` · dono: ${l.proprietario}` : ""}
                      </small>
                    </td>
                    <td>{diaCurto(l.venc)}</td>
                    <td className="num">{reais(l.aluguel.aluguelCentavos, true)}</td>
                    <td className="num">{reais(l.aluguel.taxaAdmCentavos, true)}</td>
                    <td className="num">{reais(l.repasse, true)}</td>
                    <td>
                      <span className={`pilula aluguel-st-${l.situacao}`}>{NOME_SITUACAO_ALUGUEL[l.situacao]}</span>
                    </td>
                    <td className="locacao-acoes">
                      {podeLancar && !l.aluguel.recebidoEm && <BotaoAcao acao={receberAluguelAcao.bind(null, empresaId, l.aluguel.id)} rotulo="Recebido" />}
                      {podeLancar && l.situacao === "atrasado" && l.telefone && (
                        <a
                          className="botao-pequeno botao-pequeno-apagado"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://wa.me/${l.telefone}?text=${encodeURIComponent(`Oi, ${l.inquilino.split(" ")[0]}! Aqui é da ${ctx.empresa.nome}. O aluguel de ${l.imovelTitulo} venceu em ${diaCurto(l.venc)} e ainda não identificamos o pagamento. Se já pagou, pode mandar o comprovante por aqui?`)}`}
                        >
                          <Icone nome="whatsapp" /> Cobrar
                        </a>
                      )}
                      {podeLancar && l.situacao === "repassar" && <BotaoAcao acao={repassarAluguelAcao.bind(null, empresaId, l.aluguel.id)} rotulo="Repassado" icone="enviar" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="vazio">Nenhum contrato ativo neste mês. Cadastre os contratos e os aluguéis aparecem aqui todo mês.</p>
        )}
      </section>

      <div className="locacao-grade">
        <section className="cartao">
          <header className="cartao-topo">
            <h2>Contratos ativos</h2>
          </header>
          {contratos.length ? (
            <ul className="contratos">
              {contratos.map((c) => {
                const dias = venceEm(c.contrato.fim, hj);
                const reajuste = proximoReajuste(c.contrato.inicio, c.contrato.fim, hj);
                const { taxa } = divisaoAluguel(c.contrato.aluguelCentavos, c.contrato.taxaAdmPcm);
                return (
                  <li key={c.contrato.id}>
                    <span>
                      <strong>
                        {c.imovelCodigo} · {c.imovelTitulo}
                      </strong>
                      <small>
                        {c.inquilino}
                        {c.proprietario ? ` · dono: ${c.proprietario}` : ""}
                        {c.contrato.garantia ? ` · ${c.contrato.garantia}` : ""}
                      </small>
                      <small>
                        Até {dataLonga(c.contrato.fim)}
                        {reajuste ? ` · reajuste ${c.contrato.indice} em ${diaCurto(reajuste)}` : ""} · vence dia {c.contrato.diaVencimento}
                      </small>
                    </span>
                    <span className="contrato-valor">
                      <b>{reais(c.contrato.aluguelCentavos)}</b>
                      <small>taxa {reais(taxa)}</small>
                      {dias <= 90 && <span className={`pilula ${dias < 0 ? "aluguel-st-atrasado" : "aluguel-st-vence_hoje"}`}>{dias < 0 ? "Vencido" : `Vence em ${dias} dias`}</span>}
                    </span>
                    {podeLancar && dias <= 90 && <BotaoAcao acao={encerrarContratoAcao.bind(null, empresaId, c.contrato.id)} rotulo="Encerrar" icone={null} classe="botao-pequeno botao-pequeno-apagado" />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="vazio">Nenhum contrato ativo.</p>
          )}
        </section>
        <section className="cartao locacao-avisos">
          <header className="cartao-topo">
            <h2>Para os próximos 90 dias</h2>
          </header>
          {vencendo.length ? (
            <ul>
              {vencendo.map((c) => (
                <li key={c.contrato.id}>
                  <Icone nome="alerta" />
                  <span>
                    <strong>{c.imovelCodigo}</strong> termina em {dataLonga(c.contrato.fim)}. Renovar com {c.inquilino} ou anunciar de novo.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vazio">Nenhum contrato termina nos próximos 90 dias.</p>
          )}
        </section>
      </div>

      {podeLancar && sp.novo && (
        <JanelaContrato
          salvar={salvarContratoAcao.bind(null, empresaId)}
          fechar={sp.mes ? `${base}?mes=${mes}` : base}
          hoje={hj}
          imoveis={imoveisOp
            .filter((i) => i.finalidade !== "venda" && (i.status === "disponivel" || i.status === "reservado"))
            .map((i) => ({ id: i.id, rotulo: `${i.codigo} · ${i.titulo}`, aluguel: i.aluguel ? centavosParaInput(i.aluguel) : "", proprietarioId: i.proprietarioId ?? "" }))}
          clientes={listaClientes}
        />
      )}
    </div>
  );
}
