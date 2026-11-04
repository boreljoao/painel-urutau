import Link from "next/link";
import { obterDb } from "@/db";
import { formatarDataCurta, hoje, mesAtual, mesValido, nomeDoMes, somarMeses } from "@/lib/datas";
import { NOME_INTENCAO } from "@/lib/atendimento";
import { pode } from "@/lib/permissoes";
import { listarConversas } from "@/lib/servidor/atendimento";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
import { listarParaConferir } from "@/lib/servidor/conferencia";
import { carregarPainel } from "@/lib/servidor/painel";
import { exigirAcesso } from "@/servidor/acesso";
import { BotaoLancar } from "@/componentes/BotaoLancar";
import { Icone } from "@/componentes/Icone";
import { haQuanto, iniciais, porcento, reais, reaisCurto, tomDe } from "@/componentes/formato";
import { BarrasFontes, BotaoConferir, Contador, Entrada, GraficoMeses, Medidor } from "@/componentes/vivos";
import { conferir } from "./acoes";

export const metadata = { title: "Visão geral" };
export const dynamic = "force-dynamic";

const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${ABREV[Number(m.slice(5)) - 1]}${m.endsWith("-01") ? ` ${m.slice(2, 4)}` : ""}`;

function Cartao({ classe, titulo, acao, children }: { classe: string; titulo?: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`cartao ${classe}`}>
      {titulo && (
        <header className="cartao-topo">
          <h2>{titulo}</h2>
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

const LinkPara = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link className="link" href={href}>
    {children} <Icone nome="seta" />
  </Link>
);

export default async function VisaoGeral({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { empresaId } = await params;
  const { mes: pedido } = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_painel");
  const { empresa, papel, modulos } = ctx;
  const atual = mesAtual();
  const mes = mesValido(pedido) && pedido <= atual ? pedido : atual;
  const db = obterDb();
  await prepararEmpresa(db, empresa, mes, atual);
  const temWhatsapp = modulos.has("whatsapp") && pode(papel, "lancar");
  const [{ resumo: r, fontes, grafico, vencimentos, dividas, imposto }, aConferir, conversas] = await Promise.all([
    carregarPainel(db, empresa, mes, hoje()),
    pode(papel, "conferir") ? listarParaConferir(db, empresaId) : [],
    temWhatsapp ? listarConversas(db, empresaId, "abertas") : [],
  ]);

  const anterior = grafico.at(-2);
  const ehAtual = mes === atual;
  const pe = r.pontoEquilibrio;
  const fracaoPe = pe.tipo === "valor" && pe.valor > 0 ? r.faturamento / pe.valor : 0;
  const atrasadas = vencimentos.filter((v) => v.atrasado && v.tipo === "pagar");
  const melhorMes = [...grafico].sort((a, b) => b.faturamento - a.faturamento)[0];
  const base = `/${empresaId}`;
  const linkMes = (m: string) => (m === atual ? base : `${base}?mes=${m}`);

  return (
    <>
      <header className="titulo">
        <div>
          <h1>Visão geral</h1>
          <p>
            {ehAtual ? `${nomeDoMes(mes)}, até hoje` : nomeDoMes(mes)} · {empresa.cidade ?? empresa.nome}
          </p>
        </div>
        <div className="topo-acoes">
          <nav className="seletor-mes" aria-label="Mês">
            <Link href={linkMes(somarMeses(mes, -1))} aria-label="Mês anterior">
              ‹
            </Link>
            <span>{nomeDoMes(mes)}</span>
            {ehAtual ? <span aria-hidden>›</span> : <Link href={linkMes(somarMeses(mes, 1))} aria-label="Próximo mês">›</Link>}
          </nav>
          <BotaoLancar empresaId={empresaId} />
        </div>
      </header>

      {atrasadas.length > 0 && (
        <p className="faixa-alerta" role="status">
          <Icone nome="alerta" />
          {atrasadas.length === 1 ? "1 conta atrasada" : `${atrasadas.length} contas atrasadas`} somando {reais(atrasadas.reduce((t, v) => t + v.valor, 0))}.
        </p>
      )}

      <Entrada className="grade">
        <Cartao classe="c3" titulo="Faturamento">
          <Contador className="grande" valor={r.faturamento} />
          <p className="nota">{anterior ? `${nomeDoMes(anterior.mes).split(" ")[0]} fechou em ${reaisCurto(anterior.faturamento)}.` : "Primeiro mês com lançamentos."}</p>
        </Cartao>
        <Cartao classe="c3" titulo="Lucro líquido">
          <Contador className={`grande ${r.lucro < 0 ? "ruim" : ""}`} valor={r.lucro} />
          <p className="nota">
            {r.margem == null ? "Sem faturamento no mês." : `Margem de ${porcento(r.margem, 1)}: de cada R$ 100 vendidos, sobraram ${reais(Math.round(r.margem / 10), true)}.`}
          </p>
        </Cartao>
        <Cartao classe="c3" titulo="Caixa do mês">
          <Contador className={`grande ${r.caixa.saldo < 0 ? "ruim" : ""}`} valor={r.caixa.saldo} />
          <p className="nota">
            Entrou {reaisCurto(r.caixa.entradas)} · saiu {reaisCurto(r.caixa.saidas)}
          </p>
        </Cartao>
        <Cartao classe="c3 meta" titulo="Ponto de equilíbrio">
          {pe.tipo === "valor" ? (
            <>
              <Medidor fracao={fracaoPe} rotulo={porcento(Math.round(fracaoPe * 100_000))} />
              <p className="nota centro">
                {pe.folga >= 0 ? `Passou do ponto em ${reaisCurto(pe.folga)}: daqui pra frente é lucro.` : `Faltam ${reaisCurto(-pe.folga)} para não ter prejuízo (precisa de ${reaisCurto(pe.valor)}).`}
              </p>
            </>
          ) : (
            <p className="nota">{pe.tipo === "sem_faturamento" ? "Ainda sem vendas no mês." : "Os custos variáveis passam do faturamento: não há ponto de equilíbrio."}</p>
          )}
        </Cartao>

        <Cartao classe="c8">
          <GraficoMeses titulo="Últimos 12 meses" pontos={grafico.map((g) => ({ rotulo: rotuloMes(g.mes), faturamento: g.faturamento, despesas: g.despesas, lucro: g.lucro }))} />
          <dl className="linha-numeros">
            <div>
              <dt>Melhor mês</dt>
              <dd>
                {nomeDoMes(melhorMes.mes)} · {reaisCurto(melhorMes.faturamento)}
              </dd>
            </div>
            <div>
              <dt>Soma de 12 meses</dt>
              <dd>{reaisCurto(grafico.reduce((s, g) => s + g.faturamento, 0))}</dd>
            </div>
            <div>
              <dt>Lucro de 12 meses</dt>
              <dd>{reaisCurto(grafico.reduce((s, g) => s + g.lucro, 0))}</dd>
            </div>
          </dl>
        </Cartao>
        <Cartao classe="c4" titulo="De onde veio o faturamento">
          {fontes.some((f) => f.valor > 0) ? (
            <BarrasFontes linhas={fontes.filter((f) => f.valor > 0).map((f) => ({ nome: f.nome, valor: f.valor, participacao: porcento(f.participacao, 1) }))} />
          ) : (
            <p className="vazio">Nenhuma venda lançada neste mês.</p>
          )}
          <div className="cartao-pe">
            <LinkPara href={`${base}/vendas`}>Ver as vendas</LinkPara>
          </div>
        </Cartao>

        {temWhatsapp && (
          <Cartao classe="c7" titulo="Conversas no WhatsApp" acao={<LinkPara href={`${base}/whatsapp`}>Todas</LinkPara>}>
            {conversas.length ? (
              <ul className="lista-conversas">
                {conversas.slice(0, 5).map((c) => {
                  const nome = c.nome ?? c.telefone;
                  return (
                    <li key={c.id}>
                      <Link href={`${base}/whatsapp/${c.id}`}>
                        <span className="avatar" style={{ background: tomDe(nome) }}>
                          {iniciais(nome)}
                        </span>
                        <div>
                          <p className="nome-linha">
                            <strong>{nome}</strong>
                            <span className="nota">{haQuanto(new Date(c.ultimaMensagemEm))}</span>
                          </p>
                          <p className="trecho">
                            {c.ultimoAutor === "agente" ? "Atendente: " : c.ultimoAutor === "humano" ? "Equipe: " : ""}
                            {c.ultimoTexto ?? ""}
                          </p>
                        </div>
                        {c.status === "humano" ? (
                          <span className="pilula pilula-equipe">Chamou a equipe</span>
                        ) : c.naoLidas ? (
                          <b className="selo">{c.naoLidas}</b>
                        ) : c.intencao ? (
                          <span className="pilula">{NOME_INTENCAO[c.intencao] ?? c.intencao}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="vazio">Nenhuma conversa aberta agora.</p>
            )}
          </Cartao>
        )}
        {pode(papel, "conferir") && (
          <Cartao classe={temWhatsapp ? "c5" : "c6"} titulo="Entrou sozinho, falta o seu check">
            {aConferir.length ? (
              <ul className="lista-conferir">
                {aConferir.slice(0, 5).map((v) => (
                  <li key={v.id}>
                    <div>
                      <p>{v.descricao || v.fonte}</p>
                      <p className="nota">
                        {v.cliente ?? "Sem cliente"} · {formatarDataCurta(v.data)}
                      </p>
                    </div>
                    <strong>{reais(v.valor, true)}</strong>
                    <BotaoConferir acao={conferir.bind(null, empresaId, v.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vazio">Nada para conferir. Tudo o que entrou sozinho já foi visto.</p>
            )}
          </Cartao>
        )}

        <Cartao classe="c7" titulo={ehAtual ? "Vence nos próximos dias" : "Vencimentos do mês"}>
          {vencimentos.length ? (
            <ul className="lista-contas">
              {vencimentos.slice(0, 6).map((v) => (
                <li key={`${v.tipo}-${v.id}`} className={v.atrasado ? "atrasado" : ""}>
                  <span className={`pilula ${v.tipo === "pagar" ? "pilula-pagar" : "pilula-receber"}`}>{v.tipo === "pagar" ? "Pagar" : "Receber"}</span>
                  <div>
                    <p>{v.descricao}</p>
                    <p className="nota">{v.atrasado ? `Atrasado desde ${formatarDataCurta(v.data)}` : formatarDataCurta(v.data)}</p>
                  </div>
                  <strong className={v.tipo === "pagar" ? "" : "bom"}>
                    {v.tipo === "pagar" ? "−" : "+"}
                    {reais(v.valor, true)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vazio">Nada a pagar ou receber nos próximos dias.</p>
          )}
        </Cartao>
        <div className={`${pode(papel, "conferir") && !temWhatsapp ? "c6" : "c5"} pilha`}>
          <Cartao classe="mini" titulo="Impostos estimados">
            <p className="medio">{imposto.total == null ? "—" : reais(imposto.total)}</p>
            <p className="nota">{imposto.regime === "erro" ? imposto.mensagem : "Estimativa do mês. Confirme com o seu contador."}</p>
          </Cartao>
          <Cartao classe="mini" titulo="Dívidas">
            <p className="medio">{reais(dividas.saldo)}</p>
            <p className="nota">
              {dividas.quantidade ? `${dividas.quantidade} ${dividas.quantidade === 1 ? "contrato" : "contratos"} · ${reaisCurto(dividas.venceNoMes)} vencem neste mês` : "Nenhuma dívida cadastrada."}
            </p>
          </Cartao>
        </div>
      </Entrada>
    </>
  );
}
