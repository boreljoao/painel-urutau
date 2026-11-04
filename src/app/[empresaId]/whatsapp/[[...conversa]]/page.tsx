import Link from "next/link";
import { notFound } from "next/navigation";
import { obterDb } from "@/db";
import { NOME_ESTADO, NOME_INTENCAO, estadoDoAgente, janelaAberta, tempoDaJanela } from "@/lib/atendimento";
import { pode } from "@/lib/permissoes";
import { aprovarAcao, descartarAcao, responderAcao } from "@/lib/servidor/acoes-atendimento";
import { mudarStatusConversaAcao } from "../../acoes";
import { type FiltroConversas, listarConversas, marcarConversaLida, obterAgente, obterConversa, resumoDaLoja } from "@/lib/servidor/atendimento";
import { formatarTelefone } from "@/lib/validacao";
import { exigirAcesso } from "@/servidor/acesso";
import { Icone } from "@/componentes/Icone";
import { Topo, endereco } from "@/componentes/Topo";
import { Rascunho, Responder, RolarParaFim } from "@/componentes/conversa";
import { iniciais, quando, tomDe } from "@/componentes/formato";
import { AtualizarSozinho, BotaoAcao } from "@/componentes/vivos";

export const metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

const FILTROS: { id: FiltroConversas; nome: string }[] = [
  { id: "abertas", nome: "Abertas" },
  { id: "aprovar", nome: "Para aprovar" },
  { id: "humano", nome: "Com a equipe" },
  { id: "agente", nome: "Com o atendente" },
  { id: "encerrada", nome: "Encerradas" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });

export default async function Whatsapp({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; conversa?: string[] }>;
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const { empresaId, conversa: partes = [] } = await params;
  const { f, q = "" } = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  if (!ctx.modulos.has("whatsapp") || partes.length > 1 || (partes[0] && !UUID.test(partes[0]))) notFound();
  const conversaId = partes[0];
  const filtro = FILTROS.some((x) => x.id === f) ? (f as FiltroConversas) : "abertas";
  const db = obterDb();
  const [agente, resumo, lista, aberta] = await Promise.all([
    obterAgente(db, empresaId),
    resumoDaLoja(db, empresaId),
    listarConversas(db, empresaId, filtro, q),
    conversaId ? obterConversa(db, empresaId, conversaId) : null,
  ]);
  if (conversaId && !aberta) notFound();
  if (aberta && aberta.conversa.naoLidas > 0) await marcarConversaLida(db, empresaId, aberta.conversa.id);
  const base = `/${empresaId}/whatsapp`;
  const filtros = { f: filtro === "abertas" ? undefined : filtro, q };
  const estado = estadoDoAgente(agente ? { modo: agente.modo, conectado: !!(agente.phoneNumberId && agente.tokenCifrado), ultimoErroEm: agente.ultimoErroEm } : null);
  const podeResponder = pode(ctx.papel, "lancar");
  const agora = new Date();

  return (
    <>
      <AtualizarSozinho segundos={conversaId ? 6 : 12} />
      <Topo
        titulo="WhatsApp"
        sub={
          <>
            {agente ? `${agente.nome}, o atendente da empresa` : "O atendente ainda não foi configurado. Fale com a Urutau."}
            {agente?.numeroExibicao ? ` · ${agente.numeroExibicao}` : ""}
          </>
        }
      >
        <span className={estado === "no_ar" || estado === "aprovacao" ? "no-ar" : "pilula"}>
          {(estado === "no_ar" || estado === "aprovacao") && <i />}
          {NOME_ESTADO[estado]}
        </span>
      </Topo>

      {estado === "erro" && agente?.ultimoErro && (
        <p className="faixa-alerta" role="alert">
          <Icone nome="alerta" />O atendente teve um problema: {agente.ultimoErro}
        </p>
      )}

      <div className="kpis">
        {[
          { r: "Falaram hoje", v: resumo.hoje },
          { r: "Conversas abertas", v: resumo.abertas },
          { r: "Respostas para aprovar", v: resumo.aprovar, alerta: resumo.aprovar > 0 },
          { r: "Esperando a equipe", v: resumo.comEquipe, alerta: resumo.comEquipe > 0 },
        ].map((n) => (
          <div key={n.r} className="kpi">
            <p className="kpi-rotulo">{n.r}</p>
            <p className={`kpi-valor ${n.alerta ? "alerta" : ""}`}>{n.v}</p>
          </div>
        ))}
      </div>

      <div className="caixa-entrada">
        <section className="cartao conversas-lista lista-cartao" aria-label="Conversas">
          <form role="search" className="filtros filtros-dentro">
            {filtros.f && <input type="hidden" name="f" value={filtros.f} />}
            <label className="campo-busca">
              <Icone nome="busca" />
              <span className="oculto">Buscar conversa</span>
              <input name="q" defaultValue={q} placeholder="Nome, telefone ou assunto" />
            </label>
          </form>
          <nav className="alternar" aria-label="Filtrar conversas">
            {FILTROS.map((x) => (
              <Link key={x.id} href={endereco(base, { ...filtros, f: x.id === "abertas" ? undefined : x.id })} aria-current={filtro === x.id ? "page" : undefined}>
                {x.nome}
                {x.id === "aprovar" && resumo.aprovar ? ` · ${resumo.aprovar}` : ""}
              </Link>
            ))}
          </nav>
          {lista.length ? (
            <ul className="lista-escolha">
              {lista.map((c) => {
                const nome = c.nome ?? formatarTelefone(c.telefone);
                return (
                  <li key={c.id}>
                    <Link href={endereco(`${base}/${c.id}`, filtros)} aria-current={c.id === conversaId ? "true" : undefined} scroll={false}>
                      <span className="avatar" style={{ background: tomDe(nome) }}>
                        {iniciais(nome)}
                      </span>
                      <div>
                        <p className="nome-linha">
                          <strong>{nome}</strong>
                          <span className="nota">{quando(c.ultimaMensagemEm, agora)}</span>
                        </p>
                        <p className="trecho">
                          {c.ultimoAutor === "agente" ? "Atendente: " : c.ultimoAutor === "humano" ? "Equipe: " : ""}
                          {c.ultimoTexto ?? ""}
                        </p>
                        <p className="etiquetas">
                          {c.status === "humano" && <span className="pilula pilula-equipe">Chamou a equipe</span>}
                          {c.rascunhos > 0 && <span className="pilula pilula-equipe">Resposta para aprovar</span>}
                          {c.status === "encerrada" && <span className="pilula">Encerrada</span>}
                          {c.intencao && <span className="pilula">{NOME_INTENCAO[c.intencao] ?? c.intencao}</span>}
                        </p>
                      </div>
                      {c.naoLidas > 0 && <b className="selo">{c.naoLidas}</b>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="vazio">{q ? `Nada encontrado para "${q}".` : filtro === "aprovar" ? "Nenhuma resposta esperando aprovação." : "Nenhuma conversa aqui. Quando um cliente mandar mensagem, ela aparece na hora."}</p>
          )}
        </section>

        {aberta ? <Conversa empresaId={empresaId} dados={aberta} podeResponder={podeResponder} /> : (
          <section className="cartao conversa conversa-vazia">
            <Icone nome="whatsapp" />
            <p>Escolha uma conversa para ler e responder.</p>
            <p className="nota">O atendente responde sozinho. Quando ele chama a equipe, a conversa aparece com o selo laranja.</p>
          </section>
        )}
      </div>
    </>
  );
}

type Dados = NonNullable<Awaited<ReturnType<typeof obterConversa>>>;

function Conversa({ empresaId, dados, podeResponder }: { empresaId: string; dados: Dados; podeResponder: boolean }) {
  const { conversa: c, mensagens } = dados;
  const nome = c.nome ?? formatarTelefone(c.telefone);
  const rascunho = mensagens.findLast((m) => m.status === "rascunho");
  const janela = janelaAberta(c.ultimaEntradaEm);
  const mudar = (s: "agente" | "humano" | "encerrada") => mudarStatusConversaAcao.bind(null, empresaId, c.id, s);
  let ultimoDia = "";

  return (
    <section className="cartao conversa" aria-label={`Conversa com ${nome}`}>
      <header className="conversa-topo">
        <span className="avatar" style={{ background: tomDe(nome) }}>
          {iniciais(nome)}
        </span>
        <div>
          <h2>{nome}</h2>
          <p className="nota">
            {formatarTelefone(c.telefone)} · {c.status === "agente" ? "o atendente está respondendo" : c.status === "humano" ? "a equipe está respondendo" : "encerrada"}
          </p>
        </div>
        {podeResponder && (
          <div className="conversa-botoes">
            {c.status === "agente" ? (
              <BotaoAcao acao={mudar("humano")} rotulo="Assumir" icone={null} classe="botao-pequeno" sumir={false} />
            ) : (
              <BotaoAcao acao={mudar("agente")} rotulo="Devolver ao atendente" icone={null} classe="botao-pequeno" sumir={false} />
            )}
            {c.status !== "encerrada" && <BotaoAcao acao={mudar("encerrada")} rotulo="Encerrar" icone={null} classe="botao-claro botao-pequeno" sumir={false} />}
          </div>
        )}
        {c.clienteId && (
          <Link className="link" href={`/${empresaId}/clientes?c=${c.clienteId}`}>
            Ficha <Icone nome="seta" />
          </Link>
        )}
      </header>

      {(c.intencao || c.motivoHumano) && (
        <p className="conversa-resumo">
          {c.intencao && <strong>{NOME_INTENCAO[c.intencao] ?? c.intencao}</strong>}
          {c.resumo ? ` · ${c.resumo}` : ""}
          {c.status === "humano" && c.motivoHumano ? ` · Chamou a equipe porque: ${c.motivoHumano}` : ""}
        </p>
      )}

      <ol className="bolhas" aria-label="Mensagens">
        {mensagens
          .filter((m) => m.status !== "rascunho")
          .map((m) => {
            const d = dia.format(m.criadoEm);
            const separador = d !== ultimoDia;
            ultimoDia = d;
            return (
              <li key={m.id} className="bolha-linha">
                {separador && <p className="bolha-dia">{d}</p>}
                <div className={`bolha bolha-${m.autor} ${m.status === "falhou" ? "bolha-falhou" : ""}`}>
                  {m.autor === "agente" && <span className="quem">Atendente</span>}
                  {m.autor === "humano" && <span className="quem">Equipe da loja</span>}
                  <p>{m.texto}</p>
                  {m.acoes && m.acoes.length > 0 && (
                    <span className="feitos">
                      {m.acoes.map((a, i) => (
                        <span key={i}>
                          <Icone nome="check" />
                          {a.resumo}
                        </span>
                      ))}
                    </span>
                  )}
                  {m.autor !== "sistema" && (
                    <time>
                      {hora.format(m.criadoEm)}
                      {m.autor !== "cliente" && (m.status === "lida" ? " ✓✓" : m.status === "entregue" ? " ✓✓" : m.status === "enviada" ? " ✓" : m.status === "falhou" ? " · não entregue" : "")}
                    </time>
                  )}
                </div>
                {m.erro && <p className="erro-pequeno bolha-erro">{m.erro}</p>}
              </li>
            );
          })}
      </ol>
      <RolarParaFim marca={mensagens.length} />

      {podeResponder &&
        (rascunho ? (
          <Rascunho key={rascunho.id} texto={rascunho.texto} aprovar={aprovarAcao.bind(null, empresaId, rascunho.id)} descartar={descartarAcao.bind(null, empresaId, rascunho.id)} />
        ) : janela ? (
          <Responder
            acao={responderAcao.bind(null, empresaId, c.id)}
            aviso={c.status === "agente" ? `Se você responder, a conversa passa para a equipe. ${tempoDaJanela(c.ultimaEntradaEm)}.` : `${tempoDaJanela(c.ultimaEntradaEm)}.`}
          />
        ) : (
          <p className="conversa-fechada nota">Passaram 24 horas da última mensagem do cliente. Pelas regras do WhatsApp, a empresa só pode escrever de novo quando ele mandar mensagem.</p>
        ))}
    </section>
  );
}
