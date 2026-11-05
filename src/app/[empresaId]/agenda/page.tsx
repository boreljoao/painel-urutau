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
import { Topo, endereco } from "@/componentes/Topo";
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
  const daAgenda = agendaDoPacote(ctx.empresa.perfil);

  if (!daAgenda)
    return (
      <>
        <Topo titulo="Agenda" />
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
  const ver = sp.ver === "dia" ? "dia" : "semana";
  const seg = segundaDe(dia);
  const podeMarcar = pode(ctx.papel, "lancar");
  const filtros = {
    dia: dia === hj ? undefined : dia,
    ver: ver === "semana" ? undefined : ver,
  };
  const link = (mudar: Record<string, string | undefined>) => endereco(base, { ...filtros, ...mudar });

  const editando = sp.editar && podeMarcar ? await agendamentoDaEmpresa(empresaId, sp.editar) : undefined;
  const abrindo = podeMarcar && (!!sp.novo || !!editando);
  const [semana, opcoes] = await Promise.all([listarAgenda(empresaId, seg, somarDias(seg, 7)), abrindo ? opcoesDaAgenda(empresaId) : null]);

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
          }}
          clientes={opcoes.clientes}
          servicos={[...new Set([...opcoes.servicos, ...cfg.servicos])]}
          profissionais={opcoes.profissionais}
          salas={opcoes.salas}
          hoje={hj}
          fechar={fechar}
          aposSalvar={aposSalvar}
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

  return (
    <>
      <Topo titulo={aba.titulo} sub={ver === "semana" ? `Semana de ${nomeDaSemana(seg)}` : `${nomeDoDia(dia)}, ${diaMes(dia)}`}>
        <div className="topo-acoes">
          <nav className="seletor-mes" aria-label="Semana">
            <Link
              href={link({
                dia: ver === "dia" ? somarDias(dia, -1) : somarDias(seg, -7),
              })}
              aria-label={ver === "dia" ? "Dia anterior" : "Semana anterior"}
            >
              ‹
            </Link>
            <Link className="agenda-hoje" href={link({ dia: undefined })} aria-current={dia === hj ? "date" : undefined}>
              Hoje
            </Link>
            <Link
              href={link({
                dia: ver === "dia" ? somarDias(dia, 1) : somarDias(seg, 7),
              })}
              aria-label={ver === "dia" ? "Próximo dia" : "Próxima semana"}
            >
              ›
            </Link>
          </nav>
          <nav className="alternar agenda-ver" aria-label="Ver">
            <Link href={link({ ver: undefined })} aria-current={ver === "semana" ? "page" : undefined}>
              Semana
            </Link>
            <Link href={link({ ver: "dia" })} aria-current={ver === "dia" ? "page" : undefined}>
              Dia
            </Link>
          </nav>
          {podeMarcar && (
            <Link className="botao" href={link({ novo: "1" })} scroll={false}>
              <span aria-hidden>+</span> Marcar
            </Link>
          )}
        </div>
      </Topo>

      {janela}
      {sp.salvo && <AvisoPagina texto="Horário salvo na agenda." limpar={link({})} />}
      {sp.excluido && <AvisoPagina texto="Horário apagado." desfazer={restaurarAgendamento.bind(null, empresaId, sp.excluido)} limpar={link({})} />}

      <section className="agenda-resumo" aria-label="Resumo">
        <p>
          <strong>{plural(deHoje.length, atend, atendPlural)}</strong> hoje
          {proximo && (
            <span className="nota">
              {" "}
              · próximo: {proximo.nome.split(" ")[0]} às {proximo.hora}
            </span>
          )}
        </p>
        {livresHoje !== null && (
          <p>
            <strong>{plural(livresHoje, "horário livre", "horários livres")}</strong> ainda hoje
          </p>
        )}
        {semConfirmar > 0 && (
          <p className="agenda-resumo-alerta">
            <strong>{plural(semConfirmar, "horário", "horários")}</strong> sem confirmar nesta semana
          </p>
        )}
      </section>

      <div className={`agenda ver-${ver}`}>
        {/* Semana: a grade grande, com o tamanho de cada horário proporcional à duração. */}
        <section className="cartao agenda-semana" aria-label={`Semana de ${nomeDaSemana(seg)}`}>
          <div
            className="semana"
            style={
              {
                "--dias": dias.length,
                "--altura": `${altura}px`,
              } as React.CSSProperties
            }
          >
            <div className="semana-cab">
              <span />
              {dias.map((d) => {
                const n = (porDia.get(d) ?? []).filter((a) => ocupa(a.status)).length;
                return (
                  <Link key={d} href={link({ dia: d === hj ? undefined : d, ver: "dia" })} className={`semana-dia ${d === hj ? "hoje" : ""}`}>
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
                    {String(faixa.inicio + i).padStart(2, "0")}h
                  </span>
                ))}
              </div>
              {dias.map((d) => (
                <div key={d} className={`semana-coluna ${d === hj ? "hoje" : ""} ${d < hj ? "passado" : ""}`}>
                  {podeMarcar &&
                    d >= hj &&
                    Array.from({ length: faixa.fim - faixa.inicio }, (_, i) => (
                      <Link
                        key={i}
                        className="semana-vaga"
                        style={{ top: `${i * 64}px` }}
                        href={link({
                          dia: d,
                          novo: `${String(faixa.inicio + i).padStart(2, "0")}:00`,
                        })}
                        scroll={false}
                        aria-label={`Marcar ${nomeDoDia(d)} às ${faixa.inicio + i}h`}
                      />
                    ))}
                  {pistas(porDia.get(d) ?? []).map((a) => (
                    <Link
                      key={a.id}
                      href={podeMarcar ? link({ dia: d, editar: a.id }) : link({ dia: d, ver: "dia" })}
                      scroll={false}
                      className={`marcacao situacao-${a.status} ${a.duracaoMin < 40 ? "curta" : ""}`}
                      style={{
                        top: `${(minutos(a.hora) - faixa.inicio * 60) * pxMin}px`,
                        height: `${Math.max(a.duracaoMin * pxMin, 22)}px`,
                        left: `calc(${(a.pista / a.pistas) * 100}% + 2px)`,
                        width: `calc(${100 / a.pistas}% - 4px)`,
                      }}
                      title={`${a.hora} · ${a.nome}${a.servico ? ` · ${a.servico}` : ""} · ${NOME_STATUS[a.status]}`}
                    >
                      <span className="marcacao-hora">{a.hora}</span>
                      <strong>{a.nome}</strong>
                      {(a.servico || a.profissional) && <span className="marcacao-det">{[a.servico, a.profissional].filter(Boolean).join(" · ")}</span>}
                    </Link>
                  ))}
                  {d === hj && agora >= faixa.inicio * 60 && agora <= faixa.fim * 60 && (
                    <span
                      className="semana-agora"
                      style={{
                        top: `${(agora - faixa.inicio * 60) * pxMin}px`,
                      }}
                      aria-hidden
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

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
