import Link from "next/link";
import { type Mes, hoje, intervaloDoMes, somarDias } from "@/lib/datas";
import { proximosCompromissos } from "@/servidor/agenda";
import { carrosNoPatio, resumoDoPatio, vendidosEntre } from "@/servidor/patio";
import { Icone } from "@/componentes/Icone";
import { reais, reaisCurto } from "@/componentes/formato";
import { Contador } from "@/componentes/vivos";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaCurto = (d: string, hj: string) =>
  d === hj ? "Hoje" : d === somarDias(hj, 1) ? "Amanhã" : `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}`;
const pct = (parte: number, base: number) => (base > 0 ? `${(Math.round((parte / base) * 1000) / 10).toLocaleString("pt-BR")}%` : "—");

/**
 * A Visão geral da revenda gira em torno do carro: quanto custaram os vendidos, quanto cada um
 * deu de lucro, o que está no pátio e quem vem ver carro nos próximos dias.
 */
export async function VisaoRevenda({ empresaId, mes, atividade, grafico }: { empresaId: string; mes: Mes; atividade: React.ReactNode; grafico: React.ReactNode }) {
  const base = `/${empresaId}`;
  const hj = hoje();
  const { inicio, fim } = intervaloDoMes(mes);
  const [vendidos, patio, compromissos] = await Promise.all([vendidosEntre(empresaId, inicio, fim), carrosNoPatio(empresaId), proximosCompromissos(empresaId)]);
  const custo = vendidos.reduce((t, c) => t + c.custoTotal, 0);
  const lucro = vendidos.reduce((t, c) => t + (c.lucro ?? 0), 0);
  const faturado = vendidos.reduce((t, c) => t + (c.valorVendaCentavos ?? 0), 0);
  const medio = vendidos.length ? Math.round(lucro / vendidos.length) : 0;
  const maior = [...vendidos].sort((a, b) => (b.lucro ?? 0) - (a.lucro ?? 0))[0];
  const r = resumoDoPatio(patio);
  const totalPatio = patio.length || 1;
  const nomeCarro = new Map(patio.map((c) => [c.id, c.modelo]));
  const giroMedio = vendidos.length ? Math.round(vendidos.reduce((t, c) => t + c.dias, 0) / vendidos.length) : null;

  return (
    <>
      <Link href={`${base}/patio?ver=vendido`} className="cartao vg-numero">
        <header>
          <h2>Custo dos vendidos</h2>
        </header>
        <Contador className="grande" valor={custo} />
        <p className="nota">
          {vendidos.length} {vendidos.length === 1 ? "carro vendido" : "carros vendidos"} · {reaisCurto(faturado)} em vendas
        </p>
      </Link>
      <Link href={`${base}/patio?ver=vendido`} className="cartao vg-numero">
        <header>
          <h2>Lucro total</h2>
          {faturado > 0 && <span className="vg-delta igual">{pct(lucro, faturado)} de margem</span>}
        </header>
        <Contador className={`grande ${lucro < 0 ? "ruim" : ""}`} valor={lucro} />
        <p className="nota">Venda menos compra e preparação</p>
      </Link>
      <Link href={`${base}/patio?ver=vendido`} className="cartao vg-numero">
        <header>
          <h2>Lucro médio por carro</h2>
        </header>
        <Contador className={`grande ${medio < 0 ? "ruim" : ""}`} valor={medio} />
        <p className="nota">{giroMedio == null ? "Sem vendas no mês" : `Giro médio de ${giroMedio} ${giroMedio === 1 ? "dia" : "dias"} no pátio`}</p>
      </Link>
      <Link href={maior ? `${base}/patio?ver=vendido&editar=${maior.id}` : `${base}/patio`} className="cartao vg-numero">
        <header>
          <h2>Maior lucro</h2>
        </header>
        <Contador className="grande" valor={maior?.lucro ?? 0} />
        <p className="nota">{maior ? maior.modelo : "Nenhum carro vendido ainda"}</p>
      </Link>

      <section className="cartao rv-resultado">
        <header className="cartao-topo">
          <h2>Resultado por carro</h2>
          <Link className="link" href={`${base}/patio?ver=vendido`}>
            Ver vendidos <Icone nome="seta" />
          </Link>
        </header>
        {vendidos.length ? (
          <div className="tabela-rolar">
            <table className="tabela rv-tabela">
              <thead>
                <tr>
                  <th>Carro</th>
                  <th className="num">Custo</th>
                  <th className="num">Venda</th>
                  <th className="num">Lucro</th>
                  <th className="num">Margem</th>
                  <th className="num">Dias</th>
                </tr>
              </thead>
              <tbody>
                {vendidos.slice(0, 8).map((c) => (
                  <tr key={c.id} data-vivo={`${c.id}:${new Date(c.atualizadoEm).getTime()}`}>
                    <td>
                      <strong>{c.modelo}</strong>
                      <small>{[c.ano, c.placa].filter(Boolean).join(" · ")}</small>
                    </td>
                    <td className="num">{reais(c.custoTotal)}</td>
                    <td className="num">{reais(c.valorVendaCentavos ?? 0)}</td>
                    <td className={`num ${(c.lucro ?? 0) < 0 ? "ruim" : "bom"}`}>{reais(c.lucro ?? 0)}</td>
                    <td className="num">
                      <span className="rv-margem" style={{ ["--m" as string]: `${Math.max(0, Math.min(100, ((c.lucro ?? 0) / (c.valorVendaCentavos || 1)) * 400))}%` }}>
                        {pct(c.lucro ?? 0, c.valorVendaCentavos ?? 0)}
                      </span>
                    </td>
                    <td className="num">{c.dias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="vazio">Quando um carro for vendido pelo Pátio, o custo, a venda e o lucro dele aparecem aqui.</p>
        )}
      </section>

      <Link href={`${base}/patio`} className="cartao rv-patio">
        <header className="cartao-topo">
          <h2>Pátio hoje</h2>
          <span aria-hidden>›</span>
        </header>
        <strong className="grande">
          {patio.length} {patio.length === 1 ? "carro" : "carros"}
        </strong>
        <span className="rv-barra" aria-hidden>
          <span className="disponivel" style={{ width: `${(r.disponiveis / totalPatio) * 100}%` }} />
          <span className="reservado" style={{ width: `${(r.reservados / totalPatio) * 100}%` }} />
          <span className="preparacao" style={{ width: `${(r.preparacao / totalPatio) * 100}%` }} />
        </span>
        <ul className="rv-legenda">
          <li className="disponivel">
            <b>{r.disponiveis}</b> {r.disponiveis === 1 ? "disponível" : "disponíveis"}
          </li>
          <li className="reservado">
            <b>{r.reservados}</b> {r.reservados === 1 ? "reservado" : "reservados"}
          </li>
          <li className="preparacao">
            <b>{r.preparacao}</b> em preparação
          </li>
        </ul>
        <p className={`vg-faixa ${r.parados60 ? "ruim" : ""}`}>
          <Icone nome={r.parados60 ? "alerta" : "financeiro"} /> {reais(r.capitalParado)} investidos
          {r.parados60 ? ` · ${r.parados60} parado${r.parados60 === 1 ? "" : "s"} há 60+ dias` : ""}
        </p>
      </Link>

      {grafico}
      {atividade}

      <section className="cartao rv-compromissos">
        <header className="cartao-topo">
          <h2>Próximos compromissos</h2>
          <Link className="link" href={`${base}/agenda`}>
            Agenda <Icone nome="seta" />
          </Link>
        </header>
        {compromissos.length ? (
          <ol>
            {compromissos.map((a) => (
              <li key={a.id}>
                <Link href={`${base}/agenda?dia=${a.data}&editar=${a.id}`}>
                  <span className="rv-quando">
                    <b>{diaCurto(a.data, hj)}</b>
                    {a.hora}
                  </span>
                  <span>
                    <strong>{a.servico || "Visita"}</strong>
                    <small>{[a.nome, a.veiculoId ? nomeCarro.get(a.veiculoId) : null].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className={`pilula situacao-${a.status}`}>{a.status === "confirmado" ? "Confirmado" : "A confirmar"}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="vazio">Nenhuma visita, test drive ou entrega nos próximos 7 dias.</p>
        )}
      </section>
    </>
  );
}
