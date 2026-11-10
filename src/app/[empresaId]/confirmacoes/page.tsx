import Link from "next/link";
import { eq } from "drizzle-orm";
import { obterDb } from "@/db";
import { agentesWhatsapp } from "@/db/schema";
import { hoje, somarDias } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/servidor/acesso";
import { listarAgenda } from "@/servidor/agenda";
import { urlPublica } from "@/servidor/instagram";
import { agendaDoPacote } from "@/pacotes/catalogo";
import { NOME_STATUS, agoraEmMinutos, horaDe, linkWhatsapp, minutos, nomeDoDia } from "@/pacotes/agenda";
import { mudarStatusAgendamento } from "@/pacotes/agenda-acoes";
import { LembretesHoje, type ItemLembrete } from "@/pacotes/LembretesHoje";
import { NOME_LEMBRETE, lembreteDevido, semAvisoRepetido, textoLembrete } from "@/pacotes/lembretes";
import { AoVivo } from "@/componentes/AoVivo";
import { Icone } from "@/componentes/Icone";
import { BotaoAcao } from "@/componentes/vivos";
import { pulsoDaEmpresa } from "../pulso";

export const metadata = { title: "Confirmações" };
export const dynamic = "force-dynamic";

/**
 * Tudo o que falta confirmar num lugar só: os horários "a confirmar" dos próximos 14 dias, os
 * lembretes prontos para mandar e o que os pacientes responderam pelo link.
 */
export default async function Confirmacoes({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const daAgenda = agendaDoPacote(ctx.empresa.perfil, ctx.config?.especialidade);
  const base = `/${empresaId}`;
  if (!daAgenda)
    return (
      <header className="titulo">
        <h1>Confirmações</h1>
        <p>As confirmações fazem parte dos pacotes com agenda.</p>
      </header>
    );
  const { cfg } = daAgenda;
  const hj = hoje();
  const agora = agoraEmMinutos();
  const podeMarcar = pode(ctx.papel, "lancar");
  const [proximos, [agente]] = await Promise.all([
    listarAgenda(empresaId, somarDias(hj, -7), somarDias(hj, 15)),
    obterDb().select({ numero: agentesWhatsapp.phoneNumberId }).from(agentesWhatsapp).where(eq(agentesWhatsapp.empresaId, empresaId)).limit(1),
  ]);
  const automatico = !!agente?.numero;
  const futuros = proximos.filter((a) => a.data > hj || (a.data === hj && minutos(a.hora) + a.duracaoMin > agora));
  const aConfirmar = futuros.filter((a) => a.status === "marcado");
  const confirmados = futuros.filter((a) => a.status === "confirmado");
  const responderam = proximos
    .filter((a) => a.respondidoEm && Date.now() - new Date(a.respondidoEm).getTime() < 7 * 86_400_000)
    .sort((a, b) => new Date(b.respondidoEm!).getTime() - new Date(a.respondidoEm!).getTime())
    .slice(0, 8);
  const filtrarSerie = semAvisoRepetido(futuros);
  const lembretes: ItemLembrete[] = podeMarcar
    ? futuros
        .filter((a) => a.telefone && (!automatico || !!(a.lembretes as Record<string, string>).erro))
        .flatMap((a) => {
          const tipo = filtrarSerie(a, lembreteDevido(a));
          if (!tipo) return [];
          const texto = textoLembrete(tipo, { nome: a.nome, data: a.data, hora: a.hora, atendimento: a.servico || cfg.atendimento, empresa: ctx.empresa.nome, link: `${urlPublica()}/confirmar/${a.tokenPaciente}`, hoje: hj });
          return [{ id: a.id, nome: a.nome, quando: `${a.data === hj ? "hoje" : `${a.data.slice(8)}/${a.data.slice(5, 7)}`} ${a.hora}`, tipo, tipoNome: NOME_LEMBRETE[tipo], whatsapp: linkWhatsapp(a.telefone!, texto) }];
        })
    : [];
  const porDia = new Map<string, typeof aConfirmar>();
  for (const a of aConfirmar) porDia.set(a.data, [...(porDia.get(a.data) ?? []), a]);
  const nomeDia = (d: string) => (d === hj ? "Hoje" : d === somarDias(hj, 1) ? "Amanhã" : `${nomeDoDia(d).replace(/^./, (c) => c.toUpperCase())}, ${d.slice(8)}/${d.slice(5, 7)}`);
  const vivo = (a: { id: string; atualizadoEm: Date }) => `${a.id}:${new Date(a.atualizadoEm).getTime()}`;

  return (
    <div className="conf">
      <header className="agenda2-topo">
        <div>
          <h1>Confirmações</h1>
          <p>Quem ainda não confirmou, os lembretes para mandar e o que os pacientes responderam.</p>
        </div>
        <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
      </header>
      <div className="agenda2-chips">
        <span className={`agenda2-chip${aConfirmar.length ? " alerta" : ""}`}>
          <Icone nome="relogio" /> {aConfirmar.length} a confirmar
        </span>
        <span className="agenda2-chip">
          <Icone nome="check" /> {confirmados.length} confirmados
        </span>
        <span className="agenda2-chip">
          <Icone nome="whatsapp" /> {automatico ? "Lembretes automáticos ligados" : "Lembretes pelo seu WhatsApp"}
        </span>
      </div>

      <div className="conf-grade">
        <section className="cartao conf-lista">
          <h2>A confirmar</h2>
          {porDia.size ? (
            [...porDia.entries()].map(([dia, lista]) => (
              <div key={dia} className="conf-dia">
                <h3>{nomeDia(dia)}</h3>
                <ul>
                  {lista.map((a) => (
                    <li key={a.id} data-vivo={vivo(a)}>
                      <span className="conf-hora">
                        {a.hora}
                        <small>{horaDe(minutos(a.hora) + a.duracaoMin)}</small>
                      </span>
                      <span className="conf-quem">
                        <strong>{a.nome}</strong>
                        <small>{[a.serieId ? `${a.servico || cfg.atendimento} recorrente` : a.servico, a.online ? "Online" : "", a.origem === "online" ? "marcou pela página" : ""].filter(Boolean).join(" · ")}</small>
                      </span>
                      {podeMarcar && (
                        <span className="conf-acoes">
                          <BotaoAcao acao={mudarStatusAgendamento.bind(null, empresaId, a.id, "confirmado")} rotulo="Confirmar" sumir={false} />
                          <Link className="botao-pequeno" href={`${base}/agenda?dia=${a.data}&editar=${a.id}`}>
                            Abrir
                          </Link>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="vazio">Tudo confirmado nos próximos 14 dias.</p>
          )}
        </section>

        <aside className="agenda2-lado">
          {podeMarcar && <LembretesHoje empresaId={empresaId} itens={lembretes} automatico={automatico} />}
          <section className="cartao conf-respostas">
            <h2>Responderam pelo link</h2>
            {responderam.length ? (
              <ul>
                {responderam.map((a) => (
                  <li key={a.id} data-vivo={vivo(a)}>
                    <span className={`pilula situacao-${a.status}`}>{NOME_STATUS[a.status]}</span>
                    <span>
                      <strong>{a.nome}</strong>
                      <small>
                        {nomeDia(a.data)} · {a.hora}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vazio">Quando um paciente confirmar, remarcar ou cancelar pelo link, aparece aqui.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
