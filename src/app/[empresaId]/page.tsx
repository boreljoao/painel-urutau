import Link from "next/link";
import { obterDb } from "@/db";
import { hoje, mesAtual, mesValido, nomeDoMes, somarMeses } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { listarConversas } from "@/lib/servidor/atendimento";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
import { listarParaConferir } from "@/lib/servidor/conferencia";
import { carregarPainel } from "@/lib/servidor/painel";
import { exigirAcesso } from "@/servidor/acesso";
import { atividadeRecente } from "@/servidor/atividade";
import { faturamentoDoMesAnteriorAteODia } from "@/servidor/comparativo";
import { agendaDoPacote, pacoteDe } from "@/pacotes/catalogo";
import { agoraEmMinutos, minutos } from "@/pacotes/agenda";
import { resumoDaAgenda } from "@/servidor/agenda";
import { primeirosPassos } from "@/servidor/primeiros-passos";
import { AoVivo } from "@/componentes/AoVivo";
import { BotaoLancar } from "@/componentes/BotaoLancar";
import { Icone, type NomeIcone } from "@/componentes/Icone";
import { Minigrafico } from "@/componentes/Minigrafico";
import { haQuanto, porcento, reais, reaisCurto } from "@/componentes/formato";
import { Contador, Entrada, GraficoMeses, Medidor } from "@/componentes/vivos";
import { pulsoDaEmpresa } from "./pulso";
import { VisaoRevenda } from "./VisaoRevenda";

export const metadata = { title: "Visão geral" };
export const dynamic = "force-dynamic";

const ABREV = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const rotuloMes = (m: string) =>
  `${ABREV[Number(m.slice(5)) - 1]}${m.endsWith("-01") ? ` ${m.slice(2, 4)}` : ""}`;
const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;
/** Variação em %, arredondada. */
const variacaoPct = (atual: number, antes: number) =>
  Math.round(((atual - antes) / Math.abs(antes)) * 1000) / 10;

function Delta({ v, contra }: { v: number | null; contra: string }) {
  if (v == null || !Number.isFinite(v)) return null;
  const classe = v > 0 ? "sobe" : v < 0 ? "desce" : "igual";
  return (
    <span className="vg-delta-bloco">
      <span className={`vg-delta ${classe}`}>
        {v > 0 ? "▲ +" : v < 0 ? "▼ " : "= "}
        {Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      </span>
      <small>vs. {contra}</small>
    </span>
  );
}

function Atalho({
  href,
  icone,
  titulo,
  children,
  rodape,
}: {
  href: string;
  icone: NomeIcone;
  titulo: string;
  children: React.ReactNode;
  rodape: string;
}) {
  return (
    <Link href={href} className="cartao vg-atalho">
      <header>
        <Icone nome={icone} />
        <h2>{titulo}</h2>
        <span aria-hidden>›</span>
      </header>
      <div className="vg-atalho-corpo">{children}</div>
      <span className="link">
        {rodape} <Icone nome="seta" />
      </span>
    </Link>
  );
}

export default async function VisaoGeral({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { empresaId } = await params;
  const { mes: pedido } = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_painel");
  const { empresa, papel, modulos, config } = ctx;
  const atual = mesAtual();
  const mes = mesValido(pedido) && pedido <= atual ? pedido : atual;
  const db = obterDb();
  await prepararEmpresa(db, empresa, mes, atual);
  const temWhatsapp = modulos.has("whatsapp") && pode(papel, "lancar");
  const ehAtual = mes === atual;
  const hojeData = hoje();
  const daAgenda = agendaDoPacote(empresa.perfil, config?.especialidade);
  const [
    { resumo: r, fontes, grafico, vencimentos, imposto },
    aConferir,
    conversas,
    antesAteHoje,
    agenda,
    inicio,
    atividade,
  ] = await Promise.all([
    carregarPainel(db, empresa, mes, hojeData),
    pode(papel, "conferir") ? listarParaConferir(db, empresaId) : [],
    temWhatsapp ? listarConversas(db, empresaId, "abertas") : [],
    ehAtual
      ? faturamentoDoMesAnteriorAteODia(
          db,
          empresaId,
          mes,
          Number(hojeData.slice(8)),
        )
      : null,
    daAgenda ? resumoDaAgenda(empresaId) : null,
    primeirosPassos(empresaId, empresa.perfil),
    atividadeRecente(db, empresaId),
  ]);

  const base = `/${empresaId}`;
  const pacote = pacoteDe(empresa.perfil);
  const anterior = grafico.at(-2);
  const nomeAnterior = anterior
    ? nomeDoMes(anterior.mes).split(" ")[0].slice(0, 3) +
      "/" +
      anterior.mes.slice(0, 4)
    : "";
  const pe = r.pontoEquilibrio;
  const fracaoPe =
    pe.tipo === "valor" && pe.valor > 0 ? r.faturamento / pe.valor : 0;
  const atrasadas = vencimentos.filter((v) => v.atrasado && v.tipo === "pagar");
  const vencemHoje = vencimentos.filter(
    (v) => v.data === hojeData && v.tipo === "pagar" && !v.atrasado,
  );
  const chamaramEquipe = conversas.filter((c) => c.status === "humano").length;
  const agora = agoraEmMinutos();
  const semConfirmarHoje = agenda
    ? agenda.hoje.filter(
        (a) => a.status === "marcado" && minutos(a.hora) > agora,
      ).length
    : 0;
  const pendencias = [
    atrasadas.length > 0 && {
      href: `${base}/financeiro?grupo=atrasadas#contas`,
      tom: "urgente",
      icone: "alerta" as const,
      texto: `${plural(atrasadas.length, "conta atrasada", "contas atrasadas")}`,
    },
    vencemHoje.length > 0 && {
      href: `${base}/financeiro?grupo=hoje#contas`,
      tom: "",
      icone: "agenda" as const,
      texto: `${plural(vencemHoje.length, "conta vence", "contas vencem")} hoje`,
    },
    aConferir.length > 0 && {
      href: `${base}/vendas?ver=conferir`,
      tom: "",
      icone: "vendas" as const,
      texto: `${plural(aConferir.length, "venda", "vendas")} para conferir`,
    },
    semConfirmarHoje > 0 && {
      href: `${base}/agenda#a-confirmar`,
      tom: "",
      icone: "relogio" as const,
      texto: `${plural(semConfirmarHoje, "horário", "horários")} a confirmar`,
    },
    chamaramEquipe > 0 && {
      href: `${base}/whatsapp`,
      tom: "urgente",
      icone: "whatsapp" as const,
      texto: `${plural(chamaramEquipe, "conversa pendente", "conversas pendentes")}`,
    },
  ].filter(
    (
      p,
    ): p is {
      href: string;
      tom: string;
      icone: "alerta" | "agenda" | "vendas" | "relogio" | "whatsapp";
      texto: string;
    } => !!p,
  );

  const baseFat = ehAtual ? antesAteHoje : (anterior?.faturamento ?? null);
  const deFaturamento =
    baseFat && (r.faturamento > 0 || !ehAtual)
      ? variacaoPct(r.faturamento, baseFat)
      : null;
  const deLucro =
    anterior && anterior.lucro !== 0 && !ehAtual
      ? variacaoPct(r.lucro, anterior.lucro)
      : null;
  const primeiro = Math.max(
    0,
    grafico.findIndex((g) => !g.semLancamentos),
  );
  const periodo = grafico.slice(primeiro);
  const desenho = grafico
    .slice(Math.min(primeiro, grafico.length - 2))
    .map((g) => (g.semLancamentos ? { ...g, despesas: 0, lucro: 0 } : g));
  const anoCheio = periodo.length === grafico.length;
  const linkMes = (m: string) => (m === atual ? base : `${base}?mes=${m}`);
  const vazia = inicio.vazia;
  const faltam = inicio.passos.filter((p) => !p.feito).length;
  const recente =
    Date.now() - new Date(empresa.criadoEm).getTime() <
    45 * 24 * 60 * 60 * 1000;
  const mostrarPassos = faltam > 0 && (vazia || recente);
  const temHistorico = grafico.some((g) => !g.semLancamentos);
  const meta = config?.metaCentavos ?? null;
  const fracaoMeta = meta ? r.faturamento / meta : 0;
  const atrasadoTotal = atrasadas.reduce((t, v) => t + v.valor, 0);
  const aPagar7 = vencimentos
    .filter((v) => v.tipo === "pagar" && !v.atrasado)
    .reduce((t, v) => t + v.valor, 0);
  const [ano, m] = mes.split("-").map(Number);
  const vencimentoDas = `20/${String((m % 12) + 1).padStart(2, "0")}${m === 12 ? `/${ano + 1}` : ""}`;
  const principalFonte = [...fontes].sort((a, b) => b.valor - a.valor)[0];

  // O quarto atalho muda com o ramo: pátio, estoque, agenda ou WhatsApp.
  const quarto =
    empresa.perfil === "revenda_veiculos"
      ? {
          href: `${base}/patio`,
          icone: "carro" as const,
          titulo: "Pátio e estoque",
          corpo: "Carros, status e dias parados",
          rodape: "Abrir pátio",
        }
      : empresa.perfil === "varejo" || empresa.perfil === "alimentacao"
        ? {
            href: `${base}/n/${pacote.abas[0]?.id ?? "estoque"}`,
            icone: "caixa" as const,
            titulo: "Estoque",
            corpo: "Produtos, entradas e baixas",
            rodape: "Abrir estoque",
          }
        : daAgenda && agenda
          ? {
              href: `${base}/agenda`,
              icone: "agenda" as const,
              titulo: daAgenda.aba.titulo,
              corpo: `${plural(agenda.hoje.length, "horário", "horários")} hoje`,
              rodape: "Abrir agenda",
            }
          : {
              href: `${base}/whatsapp`,
              icone: "whatsapp" as const,
              titulo: "WhatsApp",
              corpo: `${plural(conversas.length, "conversa aberta", "conversas abertas")}`,
              rodape: "Abrir conversas",
            };

  const revenda = empresa.perfil === "revenda_veiculos";
  const blocoGrafico = (
    <section className="cartao vg-grafico">
      {temHistorico ? (
        <GraficoMeses
          titulo={anoCheio ? "Últimos 12 meses" : "Desde o primeiro lançamento"}
          pontos={desenho.map((g) => ({
            rotulo: rotuloMes(g.mes),
            faturamento: g.faturamento,
            despesas: g.despesas,
            lucro: g.lucro,
          }))}
        />
      ) : (
        <>
          <header className="cartao-topo">
            <h2>Últimos 12 meses</h2>
          </header>
          <p className="vazio">
            O gráfico aparece com os primeiros lançamentos.
          </p>
        </>
      )}
    </section>
  );
  const blocoAtividade = (
    <section className="cartao vg-atividade">
      <header className="cartao-topo">
        <h2>Atividade da operação</h2>
        <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
      </header>
      {atividade.length ? (
        <ol>
          {atividade.map((a, i) => {
            const conteudo = (
              <>
                <Icone nome={a.icone} />
                <span>
                  <b>
                    {i === 0 && Date.now() - a.em.getTime() < 120_000
                      ? "Agora"
                      : haQuanto(a.em)}
                  </b>{" "}
                  · {a.texto}
                </span>
                {a.link && <span aria-hidden>›</span>}
              </>
            );
            return (
              <li
                key={a.id}
                data-vivo={`${a.id}:1`}
                className={i === 0 ? "recente" : ""}
              >
                {a.link ? (
                  <Link href={`${base}/${a.link}`}>{conteudo}</Link>
                ) : (
                  <div>{conteudo}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="vazio">
          Vendas, pagamentos e horários aparecem aqui na hora em que acontecem.
        </p>
      )}
    </section>
  );

  return (
    <div className="vg">
      <header className="vg-topo">
        <div>
          <h1>Visão geral</h1>
          <p>
            {empresa.nome}
            {empresa.cidade ? ` · ${empresa.cidade}` : ""}
          </p>
        </div>
        <div className="topo-acoes">
          <nav className="seletor-mes" aria-label="Mês">
            <Link href={linkMes(somarMeses(mes, -1))} aria-label="Mês anterior">
              ‹
            </Link>
            <span>{nomeDoMes(mes)}</span>
            {ehAtual ? (
              <span aria-hidden>›</span>
            ) : (
              <Link href={linkMes(somarMeses(mes, 1))} aria-label="Próximo mês">
                ›
              </Link>
            )}
          </nav>
          <BotaoLancar empresaId={empresaId} />
        </div>
      </header>

      {!vazia && (
        <section className="cartao vg-hoje" aria-label="Precisa de você hoje">
          <strong>Precisa de você hoje</strong>
          {pendencias.length ? (
            pendencias.map((p) => (
              <Link
                key={p.texto}
                href={p.href}
                className={`vg-pendencia ${p.tom}`}
              >
                <Icone nome={p.icone} />
                {p.texto}
                <Icone nome="seta" />
              </Link>
            ))
          ) : (
            <span className="em-dia">
              <Icone nome="check" /> Tudo em dia: nada atrasado, nada para
              conferir.
            </span>
          )}
        </section>
      )}

      <Entrada className="vg-grade">
        {mostrarPassos && (
          <section className="cartao vg-cheio primeiros-passos">
            <h2>
              {vazia
                ? "Primeiros passos"
                : `Faltam ${plural(faltam, "passo", "passos")} para o painel ficar completo`}
            </h2>
            {vazia && (
              <p className="nota">
                O painel se monta com o que você lança. Em poucos minutos
                aparecem o faturamento, o lucro e o caixa do mês.
              </p>
            )}
            <ol className="passos">
              {inicio.passos.map((p, i) => (
                <li key={p.id} className={p.feito ? "feito" : ""}>
                  <Link href={p.href}>
                    <span className="passo-num" aria-hidden>
                      {p.feito ? <Icone nome="check" /> : i + 1}
                    </span>
                    <span>
                      <strong>{p.titulo}</strong>
                      <span className="nota">
                        {p.feito ? "Feito." : p.desc}
                      </span>
                    </span>
                    {!p.feito && <Icone nome="seta" />}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!vazia && revenda && (
          <VisaoRevenda
            empresaId={empresaId}
            mes={mes}
            atividade={blocoAtividade}
            grafico={blocoGrafico}
          />
        )}
        {!vazia && !revenda && (
          <>
            <Link
              href={`${base}/vendas${ehAtual ? "" : `?mes=${mes}`}`}
              className="cartao vg-numero"
            >
              <header>
                <h2>Faturamento</h2>
                <Delta v={deFaturamento} contra={nomeAnterior} />
              </header>
              <Contador className="grande" valor={r.faturamento} />
              <Minigrafico
                valores={periodo.map((g) => g.faturamento)}
                rotulo="Faturamento dos últimos meses"
              />
            </Link>
            <Link
              href={`${base}/financeiro${ehAtual ? "" : `?mes=${mes}`}`}
              className="cartao vg-numero"
            >
              <header>
                <h2>Lucro líquido</h2>
                <Delta v={deLucro} contra={nomeAnterior} />
              </header>
              <Contador
                className={`grande ${r.lucro < 0 ? "ruim" : ""}`}
                valor={r.lucro}
              />
              <Minigrafico
                valores={periodo.map((g) => g.lucro)}
                rotulo="Lucro dos últimos meses"
              />
            </Link>
            <Link
              href={`${base}/financeiro${ehAtual ? "" : `?mes=${mes}`}#caixa`}
              className="cartao vg-numero"
            >
              <header>
                <h2>Caixa do mês</h2>
              </header>
              <Contador
                className={`grande ${r.caixa.saldo < 0 ? "ruim" : ""}`}
                valor={r.caixa.saldo}
              />
              <p className="nota">
                Entrou {reaisCurto(r.caixa.entradas)} · saiu{" "}
                {reaisCurto(r.caixa.saidas)}
              </p>
            </Link>
            {meta ? (
              <Link
                href={
                  pode(papel, "gerenciar")
                    ? `${base}/pacote#meta`
                    : `${base}/vendas`
                }
                className="cartao vg-numero"
              >
                <header>
                  <h2>Meta de vendas</h2>
                </header>
                <strong className="grande">
                  {Math.round(fracaoMeta * 100)}%
                </strong>
                <span className="vg-barra" aria-hidden>
                  <span
                    style={{ width: `${Math.min(100, fracaoMeta * 100)}%` }}
                  />
                </span>
                <p className="nota">
                  {reaisCurto(r.faturamento)} de {reaisCurto(meta)}
                </p>
              </Link>
            ) : (
              <Link
                href={
                  pode(papel, "gerenciar")
                    ? `${base}/pacote#meta`
                    : `${base}/financeiro`
                }
                className="cartao vg-numero meta"
              >
                <header>
                  <h2>Ponto de equilíbrio</h2>
                </header>
                {pe.tipo === "valor" ? (
                  <>
                    <Medidor
                      fracao={fracaoPe}
                      rotulo={porcento(Math.round(fracaoPe * 100_000))}
                    />
                    <p className="nota">
                      {pe.folga >= 0
                        ? `Passou do ponto em ${reaisCurto(pe.folga)}.`
                        : `Faltam ${reaisCurto(-pe.folga)} para não ter prejuízo.`}
                    </p>
                  </>
                ) : (
                  <p className="nota">
                    {pe.tipo === "sem_faturamento"
                      ? "Ainda sem vendas no mês."
                      : "Os custos variáveis passam do faturamento."}
                  </p>
                )}
                {pode(papel, "gerenciar") && (
                  <p className="nota">
                    Defina uma meta de vendas em Seu pacote.
                  </p>
                )}
              </Link>
            )}

            {blocoGrafico}
            {blocoAtividade}

            <Atalho
              href={`${base}/financeiro${atrasadas.length ? "?grupo=atrasadas" : ""}#contas`}
              icone="documento"
              titulo="Contas e boletos"
              rodape="Ver contas"
            >
              {atrasadoTotal > 0 ? (
                <p className="vg-faixa ruim">
                  <Icone nome="alerta" /> {reais(atrasadoTotal)} vencidos
                </p>
              ) : (
                <p className="vg-faixa">
                  <Icone nome="check" />{" "}
                  {aPagar7
                    ? `${reais(aPagar7)} nos próximos 7 dias`
                    : "Nada vencido"}
                </p>
              )}
            </Atalho>
            <Atalho
              href={`${base}/financeiro${ehAtual ? "" : `?mes=${mes}`}#despesas`}
              icone="cartao"
              titulo="Cartões e despesas"
              rodape="Ver lançamentos"
            >
              <p className="vg-faixa">
                <Icone nome="financeiro" /> {reais(r.despesasLancadas)} em
                despesas no mês
              </p>
            </Atalho>
            <Atalho
              href={`${base}/financeiro${ehAtual ? "" : `?mes=${mes}`}#impostos`}
              icone="banco"
              titulo="Impostos"
              rodape="Ver obrigações"
            >
              <p className="vg-faixa">
                <Icone nome="agenda" />{" "}
                {imposto.total == null
                  ? "Confirme com o contador"
                  : `${reais(imposto.total)} · vence ${vencimentoDas}`}
              </p>
            </Atalho>
            <Atalho
              href={quarto.href}
              icone={quarto.icone}
              titulo={quarto.titulo}
              rodape={quarto.rodape}
            >
              <p className="vg-faixa">
                <Icone nome={quarto.icone} /> {quarto.corpo}
              </p>
            </Atalho>

            <nav className="cartao vg-rodape" aria-label="Atalhos">
              {daAgenda && (
                <Link href={`${base}/agenda`}>
                  <Icone nome="agenda" /> {daAgenda.aba.titulo}{" "}
                  <span aria-hidden>›</span>
                </Link>
              )}
              <Link href={`${base}/financeiro${ehAtual ? "" : `?mes=${mes}`}`}>
                <Icone nome="financeiro" /> Ponto de equilíbrio
                {pe.tipo === "valor"
                  ? ` · ${porcento(Math.round(fracaoPe * 100_000))}`
                  : ""}{" "}
                <span aria-hidden>›</span>
              </Link>
              <Link href={`${base}/vendas${ehAtual ? "" : `?mes=${mes}`}`}>
                <Icone nome="vendas" /> Origem do faturamento
                {principalFonte?.valor ? ` · ${principalFonte.nome}` : ""}{" "}
                <span aria-hidden>›</span>
              </Link>
            </nav>
          </>
        )}
      </Entrada>
    </div>
  );
}
