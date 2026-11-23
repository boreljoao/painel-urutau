import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { obterDb } from "@/db";
import { type EtapaNegocio, clientes } from "@/db/schema";
import { centavosParaInput } from "@/lib/dinheiro";
import { diasEntre, hoje, somarDias } from "@/lib/datas";
import { ETAPAS_ABERTAS, NOME_ETAPA, comissao } from "@/lib/imobiliaria";
import { pode } from "@/lib/permissoes";
import { listarNegocios, opcoesDeImoveis } from "@/lib/servidor/imobiliaria";
import { exigirAcesso } from "@/servidor/acesso";
import { fecharNegocioAcao, moverNegocioAcao, salvarNegocioAcao } from "@/pacotes/imobiliaria-acoes";
import { JanelaNegocio } from "@/pacotes/negocio-janela";
import { AoVivo } from "@/componentes/AoVivo";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { pulsoDaEmpresa } from "../pulso";

export const metadata = { title: "Funil de negócios" };
export const dynamic = "force-dynamic";

const DICA: Record<string, string> = {
  lead: "Chegou agora: responder rápido",
  atendimento: "Entendendo o que procura",
  visita: "Visita marcada ou feita",
  proposta: "Negociando valor e condições",
};
const diaCurto = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

export default async function Negocios({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ novo?: string; editar?: string; tipo?: string }> }) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const podeLancar = pode(ctx.papel, "lancar");
  const db = obterDb();
  const hj = hoje();
  const tipo = sp.tipo === "compra" || sp.tipo === "locacao" ? sp.tipo : null;
  const [todos, imoveisOp, listaClientes] = await Promise.all([
    listarNegocios(db, empresaId, somarDias(hj, -30)),
    podeLancar ? opcoesDeImoveis(db, empresaId) : [],
    podeLancar && (sp.novo || sp.editar)
      ? db.select({ id: clientes.id, nome: clientes.nome }).from(clientes).where(and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm))).orderBy(asc(clientes.nome))
      : [],
  ]);
  const negocios = tipo ? todos.filter((n) => n.tipo === tipo) : todos;
  const base = `/${empresaId}/negocios`;
  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ tipo: tipo ?? undefined, ...extra }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `${base}?${q}` : base;
  };
  const fechar = link({});
  const porEtapa = (e: EtapaNegocio) => negocios.filter((n) => n.etapa === e);
  const abertos = negocios.filter((n) => ETAPAS_ABERTAS.includes(n.etapa));
  // Só compra soma valor: aluguel é por mês e misturar daria um número sem sentido.
  const emAberto = abertos.filter((n) => n.tipo === "compra").reduce((s, n) => s + (n.valorCentavos ?? 0), 0);
  const fechados = porEtapa("fechado");
  const perdidos = porEtapa("perdido");
  const atrasados = abertos.filter((n) => n.proximoEm && n.proximoEm < hj).length;
  const taxa = fechados.length + perdidos.length ? Math.round((fechados.length / (fechados.length + perdidos.length)) * 100) : null;
  const opcoesImoveis = imoveisOp.filter((i) => i.status === "disponivel" || i.status === "reservado").map((i) => ({ id: i.id, rotulo: `${i.codigo} · ${i.titulo}${i.bairro ? ` (${i.bairro})` : ""}` }));

  let janela: React.ReactNode = null;
  if (podeLancar && sp.novo)
    janela = <JanelaNegocio titulo="Novo interessado" salvar={salvarNegocioAcao.bind(null, empresaId, null)} inicial={{ tipo: tipo ?? "compra" }} hoje={hj} fechar={fechar} clientes={listaClientes} imoveis={opcoesImoveis} />;
  else if (podeLancar && sp.editar) {
    const n = todos.find((x) => x.id === sp.editar);
    if (n) {
      const doImovel = imoveisOp.find((i) => i.id === n.imovelId);
      const imoveisDaJanela = doImovel && !opcoesImoveis.some((i) => i.id === doImovel.id) ? [{ id: doImovel.id, rotulo: `${doImovel.codigo} · ${doImovel.titulo}` }, ...opcoesImoveis] : opcoesImoveis;
      janela = (
        <JanelaNegocio
          titulo={n.cliente}
          salvar={salvarNegocioAcao.bind(null, empresaId, n.id)}
          inicial={{
            clienteId: n.clienteId,
            imovelId: n.imovelId ?? "",
            tipo: n.tipo,
            valor: n.valorCentavos ? centavosParaInput(n.valorCentavos) : "",
            origem: n.origem,
            corretor: n.corretor,
            procura: n.procura,
            proximoPasso: n.proximoPasso,
            proximoEm: n.proximoEm ?? "",
          }}
          hoje={hj}
          fechar={fechar}
          clientes={listaClientes}
          imoveis={imoveisDaJanela}
          edicao={{
            etapa: n.etapa,
            mover: moverNegocioAcao.bind(null, empresaId, n.id),
            fechar: fecharNegocioAcao.bind(null, empresaId, n.id),
            comissaoPadrao: n.tipo === "locacao" ? "100" : String((n.comissaoPcm ?? 6000) / 1000).replace(".", ","),
            whatsapp: n.telefone ? `https://wa.me/${n.telefone}` : null,
            simular:
              n.tipo === "compra"
                ? `/${empresaId}/financiamento?${new URLSearchParams({ cliente: n.cliente, ...(n.valorCentavos ? { valor: centavosParaInput(n.valorCentavos) } : {}), ...(n.telefone ? { telefone: n.telefone } : {}) })}`
                : null,
          }}
        />
      );
    }
  }

  return (
    <div className="negocios">
      <header className="agenda2-topo">
        <div>
          <h1>Funil de negócios</h1>
          <p>
            {abertos.length} em andamento · {reais(emAberto)} em compras negociando
            {atrasados ? ` · ${atrasados} com próximo passo atrasado` : ""}
          </p>
        </div>
        <div className="topo-acoes">
          <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
          <nav className="agenda2-chips" aria-label="Filtrar">
            <Link href={base} className={`agenda2-chip${!tipo ? " ativo" : ""}`}>
              Todos
            </Link>
            <Link href={`${base}?tipo=compra`} className={`agenda2-chip${tipo === "compra" ? " ativo" : ""}`}>
              Compra
            </Link>
            <Link href={`${base}?tipo=locacao`} className={`agenda2-chip${tipo === "locacao" ? " ativo" : ""}`}>
              Locação
            </Link>
          </nav>
          {podeLancar && (
            <Link className="botao" href={link({ novo: "1" })} scroll={false}>
              + Interessado
            </Link>
          )}
        </div>
      </header>

      <div className="funil" role="list" aria-label="Etapas do funil">
        {ETAPAS_ABERTAS.map((e) => {
          const lista = porEtapa(e);
          const soma = lista.reduce((s, n) => s + (n.valorCentavos ?? 0), 0);
          return (
            <section key={e} className={`funil-coluna etapa-col-${e}`} role="listitem" aria-label={NOME_ETAPA[e]}>
              <header>
                <span>
                  <strong>{NOME_ETAPA[e]}</strong>
                  <small>{DICA[e]}</small>
                </span>
                <span className="funil-conta">{lista.length}</span>
              </header>
              {soma > 0 && <p className="funil-soma">{reais(soma)}</p>}
              <ul>
                {lista.map((n) => {
                  const parado = diasEntre(n.etapaDesde.toISOString().slice(0, 10), hj);
                  const atrasado = n.proximoEm && n.proximoEm < hj;
                  const card = (
                    <>
                      <span className="funil-topo">
                        <strong>{n.cliente}</strong>
                        <span className={`funil-tipo ${n.tipo}`}>{n.tipo === "locacao" ? "Alugar" : "Comprar"}</span>
                      </span>
                      {n.imovelCodigo ? (
                        <small className="funil-imovel">
                          <Icone nome="predio" /> {n.imovelCodigo} · {n.imovelTitulo}
                        </small>
                      ) : n.procura ? (
                        <small className="funil-imovel">
                          <Icone nome="busca" /> {n.procura}
                        </small>
                      ) : null}
                      {n.valorCentavos ? <b className="funil-valor">{reais(n.valorCentavos)}</b> : null}
                      {n.proximoPasso && (
                        <span className={`funil-passo${atrasado ? " atrasado" : ""}`}>
                          {n.proximoPasso}
                          {n.proximoEm ? ` · ${n.proximoEm === hj ? "hoje" : diaCurto(n.proximoEm)}` : ""}
                        </span>
                      )}
                      <span className="funil-pe">
                        <span>{[n.corretor, n.origem].filter(Boolean).join(" · ")}</span>
                        <span className={parado > 14 ? "parado" : ""}>{parado === 0 ? "hoje" : `${parado}d na etapa`}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={n.id}>
                      {podeLancar ? (
                        <Link href={link({ editar: n.id })} scroll={false} className="funil-card">
                          {card}
                        </Link>
                      ) : (
                        <div className="funil-card">{card}</div>
                      )}
                    </li>
                  );
                })}
                {!lista.length && <li className="funil-vazio">Ninguém nesta etapa</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="cartao funil-resultado" aria-label="Últimos 30 dias">
        <header className="cartao-topo">
          <h2>Últimos 30 dias</h2>
          {taxa != null && <span className="nota">{taxa}% dos negócios decididos foram fechados</span>}
        </header>
        <div className="funil-fim">
          <div>
            <h3>
              Fechados <span className="funil-conta bom">{fechados.length}</span>
            </h3>
            <ul>
              {fechados.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <span>
                    <strong>{n.cliente}</strong>
                    <small>{n.imovelCodigo ? `${n.imovelCodigo} · ${n.imovelTitulo}` : n.tipo === "locacao" ? "Locação" : "Compra"}</small>
                  </span>
                  <b>{n.valorCentavos ? reais(n.tipo === "locacao" ? n.valorCentavos : comissao(n.valorCentavos, n.comissaoPcm ?? 6000)) : "—"}</b>
                </li>
              ))}
              {!fechados.length && <li className="vazio">Nenhum ainda.</li>}
            </ul>
          </div>
          <div>
            <h3>
              Perdidos <span className="funil-conta">{perdidos.length}</span>
            </h3>
            <ul>
              {perdidos.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <span>
                    <strong>{n.cliente}</strong>
                    <small>{n.motivoPerda}</small>
                  </span>
                </li>
              ))}
              {!perdidos.length && <li className="vazio">Nenhum.</li>}
            </ul>
          </div>
        </div>
      </section>
      {janela}
    </div>
  );
}
