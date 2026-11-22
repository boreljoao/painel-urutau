import Link from "next/link";
import { type Mes, diasEntre, hoje, mesAtual, somarDias } from "@/lib/datas";
import { ETAPAS_ABERTAS, NOME_ETAPA, situacaoAluguel, valorAnunciado, vencimentoDoMes, nomeTipo } from "@/lib/imobiliaria";
import { alugueisDoMes, listarContratos, listarImoveis, listarNegocios, painelImobiliaria } from "@/lib/servidor/imobiliaria";
import { obterDb } from "@/db";
import { proximosCompromissos } from "@/servidor/agenda";
import { ImovelCapa } from "@/pacotes/ImovelCapa";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { Contador } from "@/componentes/vivos";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaCurto = (d: string, hj: string) =>
  d === hj ? "Hoje" : d === somarDias(hj, 1) ? "Amanhã" : `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}`;

/**
 * A Visão geral da imobiliária: o que entrou no mês (comissões e taxas), o funil, a carteira, os
 * aluguéis do mês, as visitas dos próximos dias e o que precisa de atenção hoje.
 */
export async function VisaoImobiliaria({ empresaId, mes, faturamento, cor, atividade, grafico }: { empresaId: string; mes: Mes; faturamento: number; cor: string; atividade: React.ReactNode; grafico: React.ReactNode }) {
  const base = `/${empresaId}`;
  const hj = hoje();
  const db = obterDb();
  const [p, negocios, alugueis, contratos, carteira, visitas] = await Promise.all([
    painelImobiliaria(db, empresaId, hj),
    listarNegocios(db, empresaId, somarDias(hj, -30)),
    alugueisDoMes(db, empresaId, mesAtual()),
    listarContratos(db, empresaId),
    listarImoveis(db, empresaId, { status: "ativos" }),
    proximosCompromissos(empresaId, 7, 6),
  ]);
  const c = p.carteira;
  const abertos = negocios.filter((n) => ETAPAS_ABERTAS.includes(n.etapa));
  // Só compra soma valor (aluguel é por mês: misturar daria um número sem sentido).
  const emNegociacao = abertos.filter((n) => n.tipo === "compra").reduce((s, n) => s + (n.valorCentavos ?? 0), 0);
  const locacoesAbertas = abertos.filter((n) => n.tipo === "locacao").length;
  const passosAtrasados = abertos.filter((n) => n.proximoEm && n.proximoEm < hj);
  const alug = alugueis.map((a) => ({ ...a, situacao: situacaoAluguel(a.aluguel, vencimentoDoMes(mesAtual(), a.diaVencimento), hj) }));
  const totalAlug = alug.reduce((s, a) => s + a.aluguel.aluguelCentavos, 0);
  const recebidoAlug = alug.filter((a) => a.aluguel.recebidoEm).reduce((s, a) => s + a.aluguel.aluguelCentavos, 0);
  const atrasados = alug.filter((a) => a.situacao === "atrasado");
  const repassar = alug.filter((a) => a.situacao === "repassar");
  const vencendo = contratos.filter((x) => diasEntre(hj, x.contrato.fim) <= 60);
  const maxEtapa = Math.max(1, ...ETAPAS_ABERTAS.map((e) => p.porEtapa[e]?.n ?? 0));
  const imovelDe = new Map(carteira.map((i) => [i.id, i]));
  // Em destaque: os que mais atraem interessados agora (e os recém-captados).
  const destaque = [...carteira].sort((a, b) => b.interessados - a.interessados || b.visitas30d - a.visitas30d || b.captadoEm.localeCompare(a.captadoEm)).slice(0, 3);

  const avisos: { icone: "alerta" | "chave" | "funil" | "predio"; texto: string; href: string }[] = [
    ...atrasados.slice(0, 3).map((a) => ({ icone: "alerta" as const, texto: `Aluguel atrasado: ${a.imovelCodigo} · ${a.inquilino}`, href: `${base}/locacoes` })),
    ...(repassar.length ? [{ icone: "chave" as const, texto: `${repassar.length} ${repassar.length === 1 ? "repasse" : "repasses"} para fazer aos proprietários`, href: `${base}/locacoes` }] : []),
    ...passosAtrasados.slice(0, 3).map((n) => ({ icone: "funil" as const, texto: `${n.cliente}: ${n.proximoPasso || "retomar contato"} (era ${n.proximoEm!.slice(8)}/${n.proximoEm!.slice(5, 7)})`, href: `${base}/negocios?editar=${n.id}` })),
    ...vencendo.slice(0, 2).map((x) => ({ icone: "chave" as const, texto: `Contrato de ${x.imovelCodigo} termina em ${x.contrato.fim.slice(8)}/${x.contrato.fim.slice(5, 7)}: renovar ou anunciar`, href: `${base}/locacoes` })),
    ...(c.paradosMais90 ? [{ icone: "predio" as const, texto: `${c.paradosMais90} ${c.paradosMais90 === 1 ? "imóvel disponível" : "imóveis disponíveis"} há mais de 90 dias`, href: `${base}/imoveis` }] : []),
  ];

  return (
    <>
      <Link href={`${base}/vendas${mes === mesAtual() ? "" : `?mes=${mes}`}`} className="cartao vg-numero">
        <header>
          <h2>Receita do mês</h2>
        </header>
        <Contador className="grande" valor={faturamento} />
        <p className="nota">Comissões e taxas de administração</p>
      </Link>
      <Link href={`${base}/negocios`} className="cartao vg-numero">
        <header>
          <h2>Em negociação</h2>
        </header>
        <Contador className="grande" valor={emNegociacao} />
        <p className="nota">
          {abertos.length - locacoesAbertas} de compra · {locacoesAbertas} de locação · {p.porEtapa.proposta?.n ?? 0} com proposta
        </p>
      </Link>
      <Link href={`${base}/imoveis`} className="cartao vg-numero">
        <header>
          <h2>Carteira à venda</h2>
        </header>
        <Contador className="grande" valor={c.vgv} />
        <p className="nota">
          {c.disponiveis} imóveis · comissão possível {reais(c.comissaoPotencial)}
        </p>
      </Link>
      <Link href={`${base}/locacoes`} className={`cartao vg-numero ${atrasados.length ? "vg-alerta" : ""}`}>
        <header>
          <h2>Aluguéis do mês</h2>
        </header>
        <strong className="grande">{totalAlug ? `${Math.round((recebidoAlug / totalAlug) * 100)}%` : "—"}</strong>
        <span className="vg-barra" aria-hidden>
          <span style={{ width: `${totalAlug ? (recebidoAlug / totalAlug) * 100 : 0}%` }} />
        </span>
        <p className="nota">
          {reais(recebidoAlug)} de {reais(totalAlug)}
          {atrasados.length ? ` · ${atrasados.length} atrasado${atrasados.length > 1 ? "s" : ""}` : ""}
        </p>
      </Link>

      <section className="cartao im-funil">
        <header className="cartao-topo">
          <h2>Funil de negócios</h2>
          <Link className="link" href={`${base}/negocios`}>
            Abrir funil <Icone nome="seta" />
          </Link>
        </header>
        <ol>
          {ETAPAS_ABERTAS.map((e) => {
            const x = p.porEtapa[e];
            return (
              <li key={e} className={`etapa-col-${e}`}>
                <span className="im-funil-nome">{NOME_ETAPA[e]}</span>
                <span className="im-funil-barra" aria-hidden>
                  <span style={{ width: `${((x?.n ?? 0) / maxEtapa) * 100}%` }} />
                </span>
                <b>{x?.n ?? 0}</b>
                <small>{x?.valor ? reais(x.valor) : ""}</small>
              </li>
            );
          })}
        </ol>
        <p className="im-funil-fim">
          <span className="bom">
            <Icone nome="check" /> {p.porEtapa.fechado?.n ?? 0} fechados em 30 dias
          </span>
          <span>{p.porEtapa.perdido?.n ?? 0} perdidos</span>
        </p>
      </section>

      <section className="cartao im-visitas">
        <header className="cartao-topo">
          <h2>Visitas</h2>
          <Link className="link" href={`${base}/agenda`}>
            Agenda <Icone nome="seta" />
          </Link>
        </header>
        {visitas.length ? (
          <ol>
            {visitas.map((a) => {
              const i = a.imovelId ? imovelDe.get(a.imovelId) : null;
              return (
                <li key={a.id}>
                  <Link href={`${base}/agenda?dia=${a.data}&editar=${a.id}`}>
                    <span className="rv-quando">
                      <b>{diaCurto(a.data, hj)}</b>
                      {a.hora}
                    </span>
                    <span>
                      <strong>{a.nome}</strong>
                      <small>{i ? `${i.codigo} · ${i.bairro}` : a.servico || "Visita"}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="vazio">Nenhuma visita nos próximos 7 dias.</p>
        )}
        <p className="nota">{p.visitasSemana} nesta semana</p>
      </section>

      <section className="cartao im-destaques">
        <header className="cartao-topo">
          <h2>Imóveis que mais atraem</h2>
          <Link className="link" href={`${base}/imoveis`}>
            Carteira <Icone nome="seta" />
          </Link>
        </header>
        {destaque.length ? (
          <ul>
            {destaque.map((i) => (
              <li key={i.id}>
                <Link href={`${base}/imoveis?editar=${i.id}`}>
                  <ImovelCapa codigo={i.codigo} tipo={i.tipo} foto={i.fotos[0]} cor={cor} alt={`${nomeTipo(i.tipo)} em ${i.bairro}`} />
                  <span>
                    <small>
                      {i.codigo} · {i.bairro}
                    </small>
                    <strong>{i.titulo}</strong>
                    <b>{valorAnunciado(i)}</b>
                    <small>
                      {i.interessados} {i.interessados === 1 ? "interessado" : "interessados"} · {i.visitas30d} {i.visitas30d === 1 ? "visita" : "visitas"} em 30 dias
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vazio">Cadastre os imóveis da carteira e eles aparecem aqui.</p>
        )}
      </section>

      <section className="cartao im-avisos">
        <header className="cartao-topo">
          <h2>Precisa de atenção</h2>
        </header>
        {avisos.length ? (
          <ul>
            {avisos.slice(0, 7).map((a, k) => (
              <li key={k}>
                <Link href={a.href}>
                  <Icone nome={a.icone} />
                  <span>{a.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vazio">Tudo em dia: nenhum aluguel atrasado, repasse pendente ou contato esquecido.</p>
        )}
      </section>

      {grafico}
      {atividade}
    </>
  );
}
