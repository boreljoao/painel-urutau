import Link from "next/link";
import { type Data, dataValida, hoje, somarDias } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/servidor/acesso";
import { type LinhaAgenda, agendamentoDaEmpresa, listarAgenda, opcoesDaAgenda } from "@/servidor/agenda";
import { agendaDoPacote } from "@/pacotes/catalogo";
import {
  NOME_STATUS,
  agoraEmMinutos,
  diasDaSemana,
  faixaDaGrade,
  horaDe,
  horaValida,
  horariosLivres,
  linkWhatsapp,
  mensagemDeConfirmacao,
  minutos,
  nomeDoDia,
  ocupa,
  pistas,
  segundaDe,
} from "@/pacotes/agenda";
import { excluirAgendamento, mudarStatusAgendamento, receberAgendamento, restaurarAgendamento, salvarAgendamento } from "@/pacotes/agenda-acoes";
import { JanelaAgendamento } from "@/pacotes/agenda-janela";
import { AvisoPagina } from "@/componentes/editar";
import { Icone } from "@/componentes/Icone";
import { endereco } from "@/componentes/Topo";
import { AoVivo, LinhaAgora } from "@/componentes/AoVivo";
import { pulsoDaEmpresa } from "../pulso";
import { LembretesHoje, type ItemLembrete } from "@/pacotes/LembretesHoje";
import { NOME_LEMBRETE, lembreteDevido, semAvisoRepetido, textoLembrete } from "@/pacotes/lembretes";
import { urlPublica } from "@/servidor/instagram";
import { eq as igual } from "drizzle-orm";
import { obterDb } from "@/db";
import { agentesWhatsapp } from "@/db/schema";
import { reais } from "@/componentes/formato";
import { BotaoAcao } from "@/componentes/vivos";

export const metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaMes = (d: Data) => `${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]}`;
const diaCurto = (d: Data) => `${Number(d.slice(8))}/${d.slice(5, 7)}`;

/** O texto da semana: "3 a 9 de novembro" ou "28 de outubro a 3 de novembro". */
function nomeDaSemana(seg: Data) {
  const dom = somarDias(seg, 6);
  return seg.slice(5, 7) === dom.slice(5, 7) ? `${Number(seg.slice(8))} a ${diaMes(dom)}` : `${diaMes(seg)} a ${diaMes(dom)}`;
}

export default async function Agenda({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{
    dia?: string;
    ver?: string;
    novo?: string;
    editar?: string;
    salvo?: string;
    excluido?: string;
  }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const base = `/${empresaId}/agenda`;
  const daAgenda = agendaDoPacote(ctx.empresa.perfil, ctx.config?.especialidade);

  if (!daAgenda)
    return (
      <>
        <header className="titulo">
          <h1>Agenda</h1>
        </header>
        <section className="cartao vazio-grande">
          <p>A agenda faz parte dos pacotes Consultório, Serviço com visita e Revenda de veículos.</p>
          {pode(ctx.papel, "gerenciar") && (
            <Link className="botao" href={`/${empresaId}/pacote`}>
              Ver os pacotes
            </Link>
          )}
        </section>
      </>
    );

  const { aba, cfg } = daAgenda;
  const hj = hoje();
  const dia = dataValida(sp.dia) ? sp.dia : hj;
  const ver = sp.ver === "dia" ? "dia" : sp.ver === "mes" ? "mes" : "semana";
  const seg = segundaDe(dia);
  const podeMarcar = pode(ctx.papel, "lancar");
  const filtros = {
    dia: dia === hj ? undefined : dia,
    ver: ver === "semana" ? undefined : ver,
  };
  const link = (mudar: Record<string, string | undefined>) => endereco(base, { ...filtros, ...mudar });

  const editando = sp.editar && podeMarcar ? await agendamentoDaEmpresa(empresaId, sp.editar) : undefined;
  const abrindo = podeMarcar && (!!sp.novo || !!editando);
  const primeiroDoMes = `${dia.slice(0, 7)}-01` as Data;
  const inicioMes = segundaDe(primeiroDoMes);
  const [semana, opcoes, proximos, doMes] = await Promise.all([
    listarAgenda(empresaId, seg, somarDias(seg, 7)),
    abrindo ? opcoesDaAgenda(empresaId) : null,
    listarAgenda(empresaId, hj, somarDias(hj, 31)),
    ver === "mes" ? listarAgenda(empresaId, inicioMes, somarDias(inicioMes, 42)) : null,
  ]);

  const porDia = new Map<Data, LinhaAgenda[]>();
  for (const a of semana) porDia.set(a.data, [...(porDia.get(a.data) ?? []), a]);
  const doDia = porDia.get(dia) ?? [];
  // Domingo só aparece na grade quando tem algo marcado.
  const dias = diasDaSemana(seg).filter((d, i) => i < 6 || (porDia.get(d)?.length ?? 0) > 0);
  const agora = agoraEmMinutos();
  const livresDoDia = dia < hj ? [] : horariosLivres(doDia, cfg, dia === hj ? agora : 0);
  const faixa = faixaDaGrade(semana, cfg);
  const deHoje = (porDia.get(hj) ?? []).filter((a) => ocupa(a.status));
  const proximo = deHoje.find((a) => minutos(a.hora) + a.duracaoMin > agora && a.status !== "atendido" && a.status !== "faltou");
  const livresHoje = hj >= seg && hj < somarDias(seg, 7) ? horariosLivres(porDia.get(hj) ?? [], cfg, agora).length : null;
  const semConfirmar = semana.filter((a) => a.status === "marcado" && a.data >= hj).length;

  const vocabPessoa = cfg.pessoa;
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const atend = cfg.atendimento.toLowerCase();
  const atendPlural = atend === "sessão" ? "sessões" : `${atend}s`;

  // A janela de marcar: ?novo=HH:MM (ou ?novo=1, no próximo horário livre) e ?editar=<id>.
  let janela: React.ReactNode = null;
  if (abrindo && opcoes) {
    const fechar = link({});
    const aposSalvar = link({ salvo: "1" });
    if (editando) {
      const a = editando;
      const id = a.id;
      const status = ["confirmado", "atendido", "faltou", "cancelado", "marcado"] as const;
      janela = (
        <JanelaAgendamento
          titulo={`${a.nome} · ${diaCurto(a.data)} às ${a.hora}`}
          pessoa={vocabPessoa}
          salvar={salvarAgendamento.bind(null, empresaId, id)}
          inicial={{
            nome: a.nome,
            clienteId: a.clienteId ?? "",
            telefone: a.telefone ? a.telefone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : "",
            data: a.data,
            hora: a.hora,
            duracao: String(a.duracaoMin),
            servico: a.servico,
            profissional: a.profissional,
            sala: a.sala,
            valor: a.valorCentavos ? (a.valorCentavos / 100).toFixed(2).replace(".", ",") : "",
            observacao: a.observacao,
            online: a.online ? "1" : "",
          }}
          clientes={opcoes.clientes}
          servicos={[...new Set([...opcoes.servicos, ...cfg.servicos])]}
          profissionais={opcoes.profissionais}
          salas={opcoes.salas}
          hoje={hj}
          fechar={fechar}
          aposSalvar={aposSalvar}
          rotuloServico={cfg.rotuloServico}
          edicao={{
            status: a.status,
            recebido: !!a.vendaId,
            whatsapp: a.telefone
              ? linkWhatsapp(
                  a.telefone,
                  mensagemDeConfirmacao({
                    nome: a.nome,
                    data: a.data,
                    hora: a.hora,
                    atendimento: a.servico || cfg.atendimento,
                    empresa: ctx.empresa.nome,
                    hoje: hj,
                  }),
                )
              : undefined,
            mudar: Object.fromEntries(status.map((s) => [s, mudarStatusAgendamento.bind(null, empresaId, id, s)])),
            excluir: excluirAgendamento.bind(null, empresaId, id),
            receber: receberAgendamento.bind(null, empresaId, id, cfg.atendimento),
            fontes: opcoes.fontes,
            aposExcluir: link({ excluido: id }),
          }}
        />
      );
    } else {
      const hora = horaValida(sp.novo) ? sp.novo : (livresDoDia[0] ?? horaDe(cfg.inicio * 60));
      janela = (
        <JanelaAgendamento
          titulo={`Marcar ${atend}`}
          pessoa={vocabPessoa}
          salvar={salvarAgendamento.bind(null, empresaId, null)}
          inicial={{
            data: dia,
            hora,
            duracao: String(cfg.duracao),
            servico: cfg.servicos[0] ?? "",
          }}
          clientes={opcoes.clientes}
          servicos={[...new Set([...opcoes.servicos, ...cfg.servicos])]}
          profissionais={opcoes.profissionais}
          salas={opcoes.salas}
          hoje={hj}
          fechar={fechar}
          aposSalvar={aposSalvar}
          rotuloServico={cfg.rotuloServico}
        />
      );
    }
  }

  // A lista do dia: os horários marcados em ordem, com os livres seguidos juntos numa linha só.
  type Trecho = { tipo: "livres"; horas: string[] } | { tipo: "marcado"; a: LinhaAgenda };
  const linhaDoDia: Trecho[] = [];
  for (const x of [...doDia.map((a) => ({ hora: a.hora, a })), ...livresDoDia.map((h) => ({ hora: h, a: null as LinhaAgenda | null }))].sort(
    (p, q) => p.hora.localeCompare(q.hora) || (p.a ? -1 : 1),
  )) {
    const ultimo = linhaDoDia.at(-1);
    if (x.a) linhaDoDia.push({ tipo: "marcado", a: x.a });
    else if (ultimo?.tipo === "livres") ultimo.horas.push(x.hora);
    else linhaDoDia.push({ tipo: "livres", horas: [x.hora] });
  }

  const pxMin = 64 / 60;
  const altura = (faixa.fim - faixa.inicio) * 60 * pxMin;

  // O que mostra na lateral e no topo.
  const deHojeTodos = (porDia.get(hj) ?? []).filter((a) => ocupa(a.status) && a.status !== "bloqueado");
  const aConfirmar = proximos.filter((a) => a.status === "marcado" && (a.data > hj || minutos(a.hora) + a.duracaoMin > agora)).slice(0, 6);
  const proximoGeral = proximos.find(
    (a) => ocupa(a.status) && a.status !== "bloqueado" && a.status !== "atendido" && a.status !== "faltou" && (a.data > hj || minutos(a.hora) + a.duracaoMin > agora),
  );
  const titulo = ctx.empresa.perfil === "consultorio" ? `Agenda de ${atendPlural}` : aba.titulo;
  const nomeHoje = nomeDoDia(hj);
  const subtitulo = `${nomeHoje.charAt(0).toUpperCase()}${nomeHoje.slice(1)}${nomeHoje === "sábado" || nomeHoje === "domingo" ? "" : "-feira"}, ${diaMes(hj)} de ${hj.slice(0, 4)}`;
  const diasGrade = ver === "dia" ? [dia] : dias;
  const nomeMes = MESES[Number(dia.slice(5, 7)) - 1];
  const rotuloPeriodo = ver === "mes" ? `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${dia.slice(0, 4)}` : ver === "dia" ? `${nomeDoDia(dia)}, ${diaMes(dia)}` : nomeDaSemana(seg);
  const anterior = ver === "mes" ? `${somarDias(primeiroDoMes, -1).slice(0, 7)}-01` : ver === "dia" ? somarDias(dia, -1) : somarDias(seg, -7);
  const seguinte = ver === "mes" ? `${somarDias(primeiroDoMes, 32).slice(0, 7)}-01` : ver === "dia" ? somarDias(dia, 1) : somarDias(seg, 7);
  const vivo = (a: LinhaAgenda) => `${a.id}:${new Date(a.atualizadoEm).getTime()}`;
  const fim = (a: LinhaAgenda) => horaDe(minutos(a.hora) + a.duracaoMin);
  const verLink = ver === "semana" ? undefined : ver;
  // Lembretes vencidos: prontos para mandar pelo WhatsApp com o link de confirmação.
  const agoraData = new Date();
  // Com o WhatsApp oficial ligado, a fila do app manda sozinha; aqui ficam só os que a Meta recusou.
  const [agenteWhats] = podeMarcar
    ? await obterDb().select({ numero: agentesWhatsapp.phoneNumberId }).from(agentesWhatsapp).where(igual(agentesWhatsapp.empresaId, empresaId)).limit(1)
    : [];
  const automatico = !!agenteWhats?.numero;
  const filtrarSerie = semAvisoRepetido(proximos.filter((a) => a.data >= hj));
  const lembretes: ItemLembrete[] = podeMarcar
    ? proximos
        .filter((a) => a.telefone && (!automatico || !!(a.lembretes as Record<string, string>).erro))
        .flatMap((a) => {
          const tipo = filtrarSerie(a, lembreteDevido(a, agoraData));
          if (!tipo) return [];
          const texto = textoLembrete(tipo, {
            nome: a.nome,
            data: a.data,
            hora: a.hora,
            atendimento: a.servico || cfg.atendimento,
            empresa: ctx.empresa.nome,
            link: `${urlPublica()}/confirmar/${a.tokenPaciente}`,
            hoje: hj,
          });
          return [{ id: a.id, nome: a.nome, quando: `${a.data === hj ? "hoje" : diaCurto(a.data)} ${a.hora}`, tipo, tipoNome: NOME_LEMBRETE[tipo], whatsapp: linkWhatsapp(a.telefone!, texto) }];
        })
        .slice(0, 12)
    : [];
  // Concordância: "nova sessão", "próxima visita"; "novo atendimento", "próximo horário".
  const feminino = /(ão|a)$/.test(atend);
  const novo = feminino ? "Nova" : "Novo";
  const proximoRotulo = feminino ? "Próxima" : "Próximo";

  return (
    <>
      <header className="agenda2-topo">
        <div>
          <h1>{titulo}</h1>
          <p>{subtitulo}</p>
        </div>
        {podeMarcar && (
          <Link className="botao" href={link({ novo: "1" })} scroll={false}>
            <span aria-hidden>+</span> {novo} {atend}
          </Link>
        )}
      </header>
      <div className="agenda2-chips" aria-label="Resumo">
        <Link href={link({ dia: undefined, ver: "dia" })} className="agenda2-chip">
          <Icone nome="agenda" /> Hoje · {plural(deHojeTodos.length, atend, atendPlural)}
        </Link>
        {aConfirmar.length > 0 && (
          <a href="#a-confirmar" className="agenda2-chip alerta">
            <Icone nome="relogio" /> {aConfirmar.length} a confirmar
          </a>
        )}
        {proximoGeral && (
          <Link
            href={link({ dia: proximoGeral.data === hj ? undefined : proximoGeral.data, editar: podeMarcar ? proximoGeral.id : undefined })}
            scroll={false}
            className="agenda2-chip"
          >
            <Icone nome="agenda" /> {proximoRotulo} · {proximoGeral.data === hj ? proximoGeral.hora.replace(":", "h") : `${diaCurto(proximoGeral.data)} ${proximoGeral.hora}`}
          </Link>
        )}
      </div>

      {janela}
      {sp.salvo && <AvisoPagina texto="Agenda atualizada." limpar={link({})} />}
      {sp.excluido && <AvisoPagina texto="Horário apagado." desfazer={restaurarAgendamento.bind(null, empresaId, sp.excluido)} limpar={link({})} />}

      <div className={`agenda agenda2 ver-${ver === "dia" ? "semana" : ver}`}>
        <section className="cartao agenda-semana agenda2-grade" aria-label={rotuloPeriodo}>
          <div className="agenda2-barra">
            <nav className="seletor-mes" aria-label="Período">
              <Link href={link({ dia: anterior })} aria-label="Anterior" scroll={false}>
                ‹
              </Link>
              <span className="agenda2-periodo">{rotuloPeriodo}</span>
              <Link href={link({ dia: seguinte })} aria-label="Próximo" scroll={false}>
                ›
              </Link>
            </nav>
            <Link className="botao-pequeno" href={link({ dia: undefined })} aria-current={dia === hj ? "date" : undefined} scroll={false}>
              Hoje
            </Link>
            <nav className="agenda2-ver" aria-label="Ver">
              {(
                [
                  ["dia", "Dia"],
                  ["semana", "Semana"],
                  ["mes", "Mês"],
                ] as const
              ).map(([k, nome]) => (
                <Link key={k} href={link({ ver: k === "semana" ? undefined : k })} aria-current={ver === k ? "page" : undefined} scroll={false}>
                  {nome}
                </Link>
              ))}
            </nav>
          </div>

          {ver === "mes" && doMes ? (
            <div className="agenda2-mes">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((n) => (
                <span key={n} className="agenda2-mes-nome">
                  {n}
                </span>
              ))}
              {Array.from({ length: 42 }, (_, i) => somarDias(inicioMes, i))
                .filter((d, i, todos) => i < 35 || todos.slice(35).some((x) => x.slice(0, 7) === dia.slice(0, 7)))
                .map((d) => {
                  const lista = doMes.filter((a) => a.data === d && ocupa(a.status));
                  return (
                    <Link
                      key={d}
                      href={link({ dia: d === hj ? undefined : d, ver: "dia" })}
                      className={`agenda2-mes-dia${d === hj ? " hoje" : ""}${d.slice(0, 7) !== dia.slice(0, 7) ? " fora" : ""}`}
                      scroll={false}
                    >
                      <strong>{Number(d.slice(8))}</strong>
                      {lista.slice(0, 3).map((a) => (
                        <span key={a.id} className={`agenda2-mes-item situacao-${a.status}`} data-vivo={vivo(a)}>
                          {a.hora} {a.status === "bloqueado" ? "Bloqueado" : a.nome.split(" ")[0]}
                        </span>
                      ))}
                      {lista.length > 3 && <em>+{lista.length - 3}</em>}
                    </Link>
                  );
                })}
            </div>
          ) : (
            <div className="semana" style={{ "--dias": diasGrade.length, "--altura": `${altura}px` } as React.CSSProperties}>
              <div className="semana-cab">
                <span />
                {diasGrade.map((d) => {
                  const n = (porDia.get(d) ?? []).filter((a) => ocupa(a.status) && a.status !== "bloqueado").length;
                  return (
                    <Link key={d} href={link({ dia: d === hj ? undefined : d, ver: "dia" })} className={`semana-dia ${d === hj ? "hoje" : ""}`} scroll={false}>
                      <span>{nomeDoDia(d, true)}</span>
                      <strong>{Number(d.slice(8))}</strong>
                      {n > 0 && <em>{n}</em>}
                    </Link>
                  );
                })}
              </div>
              <div className="semana-corpo">
                <div className="semana-horas" aria-hidden>
                  {Array.from({ length: faixa.fim - faixa.inicio }, (_, i) => (
                    <span key={i} style={{ top: `${i * 64}px` }}>
                      {String(faixa.inicio + i).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                {diasGrade.map((d) => (
                  <div key={d} className={`semana-coluna ${d === hj ? "hoje" : ""} ${d < hj ? "passado" : ""}`}>
                    {podeMarcar &&
                      d >= hj &&
                      Array.from({ length: (faixa.fim - faixa.inicio) * 2 }, (_, i) => {
                        const m = faixa.inicio * 60 + i * 30;
                        if (d === hj && m + 30 <= agora) return null;
                        const h = horaDe(m);
                        return (
                          <Link
                            key={i}
                            className="semana-vaga"
                            data-hora={h}
                            style={{ top: `${i * 32}px`, height: "32px" }}
                            href={link({ dia: d, novo: h, ver: verLink })}
                            scroll={false}
                            aria-label={`Marcar ${nomeDoDia(d)} às ${h}`}
                          />
                        );
                      })}
                    {pistas(porDia.get(d) ?? []).map((a) => (
                      <Link
                        key={a.id}
                        data-vivo={vivo(a)}
                        href={podeMarcar ? link({ dia: d, editar: a.id, ver: verLink }) : link({ dia: d, ver: "dia" })}
                        scroll={false}
                        className={`marcacao situacao-${a.status} ${a.serieId && a.status !== "bloqueado" ? "recorrente" : ""} ${a.duracaoMin < 40 ? "curta" : ""} ${a.id === proximoGeral?.id ? "proximo" : ""}`}
                        style={{
                          top: `${(minutos(a.hora) - faixa.inicio * 60) * pxMin}px`,
                          height: `${Math.max(a.duracaoMin * pxMin, 22)}px`,
                          left: `calc(${(a.pista / a.pistas) * 100}% + 3px)`,
                          width: `calc(${100 / a.pistas}% - 6px)`,
                        }}
                        title={`${a.hora}–${fim(a)} · ${a.nome}${a.servico ? ` · ${a.servico}` : ""} · ${NOME_STATUS[a.status]}`}
                      >
                        {a.status === "bloqueado" ? (
                          <>
                            <span className="marcacao-hora">
                              {a.hora}–{fim(a)}
                            </span>
                            <strong>{a.nome}</strong>
                          </>
                        ) : (
                          <>
                            <strong>
                              {a.hora} · {a.nome}
                              {a.origem === "online" && <em className="marcacao-online">online</em>}
                            </strong>
                            <span className="marcacao-det">
                              {[a.serieId ? `${a.servico || cfg.atendimento} recorrente` : a.servico, a.online ? "Online" : "", a.profissional].filter(Boolean).join(" · ") || `${a.duracaoMin} min`}
                            </span>
                          </>
                        )}
                      </Link>
                    ))}
                    {d === hj && <LinhaAgora inicioMin={faixa.inicio * 60} fimMin={faixa.fim * 60} pxMin={pxMin} mostrarHora />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="agenda2-lado">
          {podeMarcar && lembretes.length > 0 && <LembretesHoje empresaId={empresaId} itens={lembretes} automatico={automatico} />}
          <section className="cartao agenda2-proximo">
            <h2>
              {proximoRotulo} {atend}
            </h2>
            {proximoGeral ? (
              <div className="agenda2-ficha" data-vivo={vivo(proximoGeral)}>
                <p>
                  <Icone nome="agenda" /> {proximoGeral.data === hj ? "" : `${diaCurto(proximoGeral.data)} · `}
                  {proximoGeral.hora}–{fim(proximoGeral)}
                </p>
                <p>
                  <Icone nome="pessoa" /> {proximoGeral.nome}
                </p>
                {proximoGeral.servico && (
                  <p>
                    <Icone nome="documento" /> {proximoGeral.servico}
                  </p>
                )}
                <span className={`pilula situacao-${proximoGeral.status}`}>
                  {proximoGeral.status === "confirmado" ? "✓ " : ""}
                  {NOME_STATUS[proximoGeral.status]}
                </span>
                {podeMarcar && (
                  <div className="agenda2-ficha-acoes">
                    <Link className="botao" href={link({ dia: proximoGeral.data === hj ? undefined : proximoGeral.data, editar: proximoGeral.id })} scroll={false}>
                      Ver {atend} <Icone nome="seta" />
                    </Link>
                    {proximoGeral.status === "marcado" && (
                      <BotaoAcao acao={mudarStatusAgendamento.bind(null, empresaId, proximoGeral.id, "confirmado")} rotulo="Confirmar" sumir={false} />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="vazio">Nada marcado nos próximos dias.</p>
            )}
          </section>
          <section className="cartao agenda2-confirmar" id="a-confirmar">
            <h2>A confirmar</h2>
            {aConfirmar.length ? (
              <ul>
                {aConfirmar.map((a) => (
                  <li key={a.id} data-vivo={vivo(a)}>
                    <Link href={podeMarcar ? link({ dia: a.data === hj ? undefined : a.data, editar: a.id }) : link({ dia: a.data, ver: "dia" })} scroll={false}>
                      <Icone nome="relogio" />
                      <span>
                        <strong>
                          {a.data === hj ? "" : `${diaCurto(a.data)} · `}
                          {a.hora}–{fim(a)}
                        </strong>
                        <span>{a.nome}</span>
                        {a.servico && <small>{a.servico}</small>}
                      </span>
                      <span className="pilula situacao-marcado">A confirmar</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vazio">Tudo confirmado.</p>
            )}
            <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} rotulo="Atualizado agora" />
          </section>
        </aside>

        {/* Dia: a lista grande, com os horários livres entre os marcados. No celular, é a tela principal. */}
        <section className="agenda-dia" aria-label={`${nomeDoDia(dia)}, ${diaMes(dia)}`}>
          <nav className="dias-chips" aria-label="Dias da semana">
            {diasDaSemana(seg).map((d) => {
              const n = (porDia.get(d) ?? []).filter((a) => ocupa(a.status)).length;
              return (
                <Link key={d} href={link({ dia: d === hj ? undefined : d })} aria-current={d === dia ? "date" : undefined} className={d === hj ? "hoje" : ""}>
                  <span>{nomeDoDia(d, true)}</span>
                  <strong>{Number(d.slice(8))}</strong>
                  <em aria-label={plural(n, "marcado", "marcados")}>{n > 0 ? "•".repeat(Math.min(n, 4)) : ""}</em>
                </Link>
              );
            })}
          </nav>
          <h2 className="agenda-dia-titulo">
            {dia === hj ? "Hoje" : dia === somarDias(hj, 1) ? "Amanhã" : nomeDoDia(dia)}, {diaMes(dia)}
          </h2>
          <ol className="linha-do-dia">
            {linhaDoDia.map((t) => {
              if (t.tipo === "livres")
                return (
                  <li key={`livres-${t.horas[0]}`} className="livres">
                    <span className="livres-rotulo">{t.horas.length === 1 ? "Livre" : `${t.horas.length} livres`}</span>
                    <div className="livres-horas">
                      {t.horas.map((h) =>
                        podeMarcar ? (
                          <Link key={h} href={link({ novo: h })} scroll={false} aria-label={`Marcar às ${h}`}>
                            {h}
                          </Link>
                        ) : (
                          <span key={h}>{h}</span>
                        ),
                      )}
                    </div>
                  </li>
                );
              const a = t.a;
              return (
                <li key={a.id} className={`atendimento situacao-${a.status}`}>
                  <div className="atendimento-hora">
                    <strong>{a.hora}</strong>
                    <span>{horaDe(minutos(a.hora) + a.duracaoMin)}</span>
                  </div>
                  <div className="atendimento-corpo">
                    <p className="atendimento-nome">
                      {podeMarcar ? (
                        <Link href={link({ editar: a.id })} scroll={false}>
                          {a.nome}
                        </Link>
                      ) : (
                        a.nome
                      )}
                      <span className={`pilula situacao-${a.status}`}>{NOME_STATUS[a.status]}</span>
                    </p>
                    <p className="atendimento-det">
                      {[a.servico, a.profissional && `com ${a.profissional}`, a.sala, a.valorCentavos ? reais(a.valorCentavos) : ""].filter(Boolean).join(" · ") ||
                        `${a.duracaoMin} min`}
                    </p>
                    {a.observacao && <p className="nota">{a.observacao}</p>}
                    {podeMarcar && ocupa(a.status) && a.status !== "atendido" && a.status !== "faltou" && (
                      <div className="atendimento-acoes">
                        {a.telefone && (
                          <a
                            className="botao-pequeno"
                            href={linkWhatsapp(
                              a.telefone,
                              mensagemDeConfirmacao({
                                nome: a.nome,
                                data: a.data,
                                hora: a.hora,
                                atendimento: a.servico || cfg.atendimento,
                                empresa: ctx.empresa.nome,
                                hoje: hj,
                              }),
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icone nome="whatsapp" />
                            <span>Confirmar</span>
                          </a>
                        )}
                        {a.status === "marcado" && <BotaoAcao acao={mudarStatusAgendamento.bind(null, empresaId, a.id, "confirmado")} rotulo="Confirmado" sumir={false} />}
                        {a.data <= hj && <BotaoAcao acao={mudarStatusAgendamento.bind(null, empresaId, a.id, "atendido")} rotulo="Atendido" sumir={false} />}
                        {a.data <= hj && (
                          <BotaoAcao
                            acao={mudarStatusAgendamento.bind(null, empresaId, a.id, "faltou")}
                            rotulo="Faltou"
                            icone={null}
                            classe="botao-pequeno botao-pequeno-apagado"
                            sumir={false}
                          />
                        )}
                      </div>
                    )}
                    {podeMarcar && a.status === "atendido" && !a.vendaId && (
                      <div className="atendimento-acoes">
                        <Link className="botao-pequeno" href={link({ editar: a.id })} scroll={false}>
                          <Icone nome="vendas" />
                          <span>Lançar recebimento</span>
                        </Link>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {!doDia.length && !livresDoDia.length && <p className="vazio">{dia < hj ? "Nada foi marcado neste dia." : "Sem horários neste dia."}</p>}
        </section>
      </div>
    </>
  );
}
