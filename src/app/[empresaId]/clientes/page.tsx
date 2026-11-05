import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { obterDb } from "@/db";
import { conversas } from "@/db/schema";
import { formatarData } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { ROTULO_ORIGEM_VENDA } from "@/lib/rotulos";
import { comprasDoCliente, listarClientes, obterCliente } from "@/lib/servidor/clientes";
import { formatarTelefone } from "@/lib/validacao";
import { exigirAcesso } from "@/servidor/acesso";
import { JanelaCliente } from "@/componentes/editar";
import { Icone } from "@/componentes/Icone";
import { salvarCliente } from "../acoes";
import { Topo, endereco } from "@/componentes/Topo";
import { haQuanto, iniciais, reais, tomDe } from "@/componentes/formato";
import { Entrada } from "@/componentes/vivos";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const ORIGEM: Record<string, { nome: string; classe: string }> = {
  whatsapp: { nome: "WhatsApp", classe: "pilula-whatsapp" },
  site: { nome: "Site", classe: "pilula-site" },
  balcao: { nome: "Balcão", classe: "" },
  indicacao: { nome: "Indicação", classe: "" },
  manual: { nome: "Cadastro", classe: "" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Clientes({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ q?: string; c?: string }> }) {
  const { empresaId } = await params;
  const { q = "", c } = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const db = obterDb();
  const lista = await listarClientes(db, empresaId, q);
  const base = `/${empresaId}/clientes`;
  // No computador já abre a ficha do primeiro da lista.
  const escolhidoId = c && UUID.test(c) ? c : lista[0]?.id;
  const veCompras = pode(ctx.papel, "ver_todos_lancamentos");
  const podeEditar = pode(ctx.papel, "lancar");
  const [cliente, compras, conversa] = escolhidoId
    ? await Promise.all([
        obterCliente(db, empresaId, escolhidoId),
        veCompras ? comprasDoCliente(db, empresaId, escolhidoId) : [],
        ctx.modulos.has("whatsapp")
          ? db
              .select({ id: conversas.id, ultimaMensagemEm: conversas.ultimaMensagemEm, resumo: conversas.resumo })
              .from(conversas)
              .where(and(eq(conversas.empresaId, empresaId), eq(conversas.clienteId, escolhidoId), eq(conversas.canal, "whatsapp")))
              .orderBy(desc(conversas.ultimaMensagemEm))
              .limit(1)
              .then((r) => r[0])
          : undefined,
      ])
    : [undefined, [], undefined];
  const total = compras.reduce((s, x) => s + x.valor, 0);
  const pelaIa = lista.filter((x) => x.origem === "whatsapp" || x.origem === "site").length;
  const compraram = lista.filter((x) => x.compras > 0).length;

  return (
    <>
      <Topo titulo="Clientes" sub={q ? `Busca por "${q}"` : "Quem já comprou ou falou com a empresa"}>
        {podeEditar && (
          <div className="topo-acoes">
            <JanelaCliente acao={salvarCliente.bind(null, empresaId, null)} rotulo="+ Novo cliente" titulo="Novo cliente" lista={base} />
          </div>
        )}
      </Topo>
      <Entrada className="kpis">
        <div className="kpi">
          <p className="kpi-rotulo">Clientes{q ? " encontrados" : ""}</p>
          <p className="kpi-valor">{lista.length >= 200 ? "200+" : lista.length}</p>
        </div>
        <div className="kpi">
          <p className="kpi-rotulo">Já compraram</p>
          <p className="kpi-valor">
            {compraram} <small>{lista.length ? `${Math.round((compraram / lista.length) * 100)}%` : ""}</small>
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-rotulo">Chegaram pelo atendente</p>
          <p className="kpi-valor">
            {pelaIa} <small>WhatsApp e site</small>
          </p>
        </div>
      </Entrada>

      <div className="dividida" style={{ marginTop: 16 }}>
        <section className="cartao lista-cartao">
          <form role="search" className="filtros filtros-dentro">
            <label className="campo-busca">
              <Icone nome="busca" />
              <span className="oculto">Buscar cliente</span>
              <input name="q" defaultValue={q} placeholder="Nome ou telefone" />
            </label>
          </form>
          {lista.length ? (
            <ul className="lista-escolha">
              {lista.map((x) => (
                <li key={x.id}>
                  <Link href={endereco(base, { q, c: x.id })} aria-current={x.id === escolhidoId ? "true" : undefined} scroll={false}>
                    <span className="avatar" style={{ background: tomDe(x.nome) }}>
                      {iniciais(x.nome)}
                    </span>
                    <div>
                      <p>{x.nome}</p>
                      <p className="nota">
                        {formatarTelefone(x.telefone) || "sem telefone"}
                        {x.compras ? ` · ${x.compras} ${x.compras === 1 ? "compra" : "compras"}` : ""}
                      </p>
                    </div>
                    {ORIGEM[x.origem] && x.origem !== "manual" && <span className={`pilula ${ORIGEM[x.origem].classe}`}>{ORIGEM[x.origem].nome}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vazio">{q ? `Ninguém encontrado para "${q}".` : "Nenhum cliente ainda. Quem falar pelo WhatsApp entra aqui sozinho."}</p>
          )}
        </section>

        {cliente ? (
          <section className="cartao ficha" aria-label={`Ficha de ${cliente.nome}`}>
            <div className="ficha-topo">
              <span className="avatar avatar-g" style={{ background: tomDe(cliente.nome) }}>
                {iniciais(cliente.nome)}
              </span>
              <div>
                <h2>{cliente.nome}</h2>
                <p className="nota">
                  {[formatarTelefone(cliente.telefone), cliente.email, `cliente desde ${formatarData(cliente.criadoEm.toISOString().slice(0, 10))}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="topo-acoes">
                {podeEditar && (
                  <JanelaCliente
                    key={cliente.id}
                    acao={salvarCliente.bind(null, empresaId, cliente.id)}
                    inicial={{ nome: cliente.nome, telefone: formatarTelefone(cliente.telefone), email: cliente.email ?? "", documento: cliente.documento ?? "", observacao: cliente.observacao }}
                    rotulo="Editar"
                    classe="botao-claro"
                    titulo={`Editar ${cliente.nome}`}
                    lista={endereco(base, { q })}
                  />
                )}
                {cliente.telefone && (
                  <a className="botao" href={`https://wa.me/${cliente.telefone}`} target="_blank" rel="noreferrer">
                    <Icone nome="whatsapp" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

            {veCompras && (
              <div className="kpis kpis-ficha">
                <div className="kpi">
                  <p className="kpi-rotulo">Compras</p>
                  <p className="kpi-valor">{compras.length}</p>
                </div>
                <div className="kpi">
                  <p className="kpi-rotulo">Total gasto</p>
                  <p className="kpi-valor">{reais(total)}</p>
                </div>
                <div className="kpi">
                  <p className="kpi-rotulo">Ticket médio</p>
                  <p className="kpi-valor">{compras.length ? reais(Math.round(total / compras.length)) : "—"}</p>
                </div>
                <div className="kpi">
                  <p className="kpi-rotulo">Última compra</p>
                  <p className="kpi-valor">{compras[0] ? formatarData(compras[0].data).slice(0, 5) : "—"}</p>
                </div>
              </div>
            )}

            {conversa && (
              <Link className="faixa-conversa" href={`/${empresaId}/whatsapp/${conversa.id}`}>
                <Icone nome="whatsapp" />
                <span>
                  <strong>Conversa no WhatsApp</strong> · {haQuanto(new Date(conversa.ultimaMensagemEm))}
                  {conversa.resumo ? <span className="nota"> · {conversa.resumo}</span> : null}
                </span>
                <Icone nome="seta" />
              </Link>
            )}

            {cliente.observacao && (
              <div>
                <h3>Anotações</h3>
                <p className="observacao">{cliente.observacao}</p>
              </div>
            )}

            {veCompras && (
              <div>
                <h3>Histórico de compras</h3>
                {compras.length ? (
                  <ul className="historico">
                    {compras.map((x) => (
                      <li key={x.id}>
                        <span className="ponto" />
                        <div>
                          <p>{x.descricao || x.fonte}</p>
                          <p className="nota">
                            {formatarData(x.data)} · {x.fonte} · {ROTULO_ORIGEM_VENDA[x.origem]}
                          </p>
                        </div>
                        <strong>{reais(x.valor, true)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="vazio">Ainda não comprou.</p>
                )}
              </div>
            )}
          </section>
        ) : (
          lista.length > 0 && <section className="cartao vazio">Escolha um cliente na lista.</section>
        )}
      </div>
    </>
  );
}
