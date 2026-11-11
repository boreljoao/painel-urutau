import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { vendas } from "@/db/schema";
import { diasNoMes, hoje, mesAtual } from "@/lib/datas";
import { formatarQuantidade } from "@/lib/estoque";
import type { ItemVencimento } from "@/lib/servidor/painel";
import { opcoesDeClientes } from "@/lib/servidor/clientes";
import { painelEstoque, produtosDoCaixa } from "@/lib/servidor/estoque";
import { buscarNoCaixaAcao, venderAcao } from "@/pacotes/estoque-acoes";
import { CaixaPdv } from "@/pacotes/CaixaPdv";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { Contador } from "@/componentes/vivos";

const ORIGEM: Record<string, string> = { balcao: "Caixa", whatsapp: "WhatsApp", site: "Site", agenda: "Agenda", manual: "Lançada" };
const hora = (d: Date) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const diaCurto = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

/**
 * A Visão geral da loja é a operação do dia: quanto vendeu hoje, se bate a meta, o caixa rápido
 * com o leitor de código de barras, o que repor e as contas que vencem.
 */
export async function VisaoLoja({
  empresaId,
  metaMes,
  vencimentos,
  atividade,
  grafico,
  podeVender,
}: {
  empresaId: string;
  metaMes: number | null;
  vencimentos: ItemVencimento[];
  atividade: React.ReactNode;
  grafico: React.ReactNode;
  podeVender: boolean;
}) {
  const base = `/${empresaId}`;
  const hj = hoje();
  const db = obterDb();
  const vivas = and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm));
  const [[doDia], ultimas, estoque, produtos, clientes] = await Promise.all([
    db
      .select({ total: sql<number>`coalesce(sum(${vendas.valorCentavos}), 0)::bigint`.mapWith(Number), n: sql<number>`count(*)::int` })
      .from(vendas)
      .where(and(vivas, eq(vendas.data, hj))),
    db
      .select({ id: vendas.id, valor: vendas.valorCentavos, descricao: vendas.descricao, origem: vendas.origem, status: vendas.status, criadoEm: vendas.criadoEm, data: vendas.data })
      .from(vendas)
      .where(vivas)
      .orderBy(desc(vendas.data), desc(vendas.criadoEm))
      .limit(6),
    painelEstoque(db, empresaId),
    podeVender ? produtosDoCaixa(db, empresaId) : [],
    podeVender ? opcoesDeClientes(db, empresaId) : [],
  ]);
  const metaDia = metaMes ? Math.round(metaMes / diasNoMes(mesAtual())) : null;
  const fracaoDia = metaDia ? doDia.total / metaDia : 0;
  const ticket = doDia.n ? Math.round(doDia.total / doDia.n) : 0;
  const aPagar = vencimentos.filter((v) => v.tipo === "pagar").slice(0, 5);
  const aReceber = vencimentos.filter((v) => v.tipo === "receber").slice(0, 5);
  const totalPagar = vencimentos.filter((v) => v.tipo === "pagar").reduce((t, v) => t + v.valor, 0);
  const totalReceber = vencimentos.filter((v) => v.tipo === "receber").reduce((t, v) => t + v.valor, 0);
  const critico = estoque.repor;

  return (
    <>
      <Link href={`${base}/vendas`} className="cartao vg-numero">
        <header>
          <h2>Vendas hoje</h2>
        </header>
        <Contador className="grande" valor={doDia.total} />
        <p className="nota">
          {doDia.n} {doDia.n === 1 ? "venda" : "vendas"}
          {doDia.n ? ` · ticket médio ${reais(ticket)}` : ""}
        </p>
      </Link>
      <Link href={`${base}/caixa`} className="cartao vg-numero">
        <header>
          <h2>Meta do dia</h2>
        </header>
        {metaDia ? (
          <>
            <strong className="grande">{Math.round(fracaoDia * 100)}%</strong>
            <span className="vg-barra" aria-hidden>
              <span style={{ width: `${Math.min(100, fracaoDia * 100)}%` }} />
            </span>
            <p className="nota">
              {reais(doDia.total)} de {reais(metaDia)}
            </p>
          </>
        ) : (
          <p className="nota">Defina a meta do mês em Seu pacote: a meta do dia sai dela.</p>
        )}
      </Link>
      <Link href={`${base}/estoque?ver=repor`} className={`cartao vg-numero ${critico ? "vg-alerta" : ""}`}>
        <header>
          <h2>Estoque crítico</h2>
        </header>
        <strong className={`grande ${critico ? "ruim" : ""}`}>{critico}</strong>
        <p className="nota">
          {estoque.semEstoque} sem estoque · {estoque.abaixoMinimo} abaixo do mínimo
        </p>
      </Link>
      <Link href={`${base}/estoque`} className="cartao vg-numero">
        <header>
          <h2>Mercadoria em estoque</h2>
        </header>
        <Contador className="grande" valor={estoque.valorEmCusto} />
        <p className="nota">Vale {reais(estoque.valorEmVenda)} na venda</p>
      </Link>

      {podeVender && (
        <section className="cartao loja-caixa">
          <header className="cartao-topo">
            <h2>Caixa rápido</h2>
            <Link className="link" href={`${base}/caixa`}>
              Abrir caixa completo <Icone nome="seta" />
            </Link>
          </header>
          <CaixaPdv produtos={produtos} clientes={clientes} vender={venderAcao.bind(null, empresaId)} buscar={buscarNoCaixaAcao.bind(null, empresaId)} base={base} compacto />
        </section>
      )}

      <section className="cartao loja-repor">
        <header className="cartao-topo">
          <h2>Produtos para repor</h2>
          <Link className="link" href={`${base}/estoque?ver=repor`}>
            Ver todos <Icone nome="seta" />
          </Link>
        </header>
        {estoque.comprar.length ? (
          <ul>
            {estoque.comprar.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link href={`${base}/estoque?editar=${p.id}`}>
                  <span>
                    <strong>{p.nome}</strong>
                    <small>
                      {formatarQuantidade(p.saldoMil, p.unidade)} em estoque
                      {p.cobertura != null ? ` · dura ${p.cobertura} ${p.cobertura === 1 ? "dia" : "dias"}` : ""}
                    </small>
                  </span>
                  <b>Comprar {formatarQuantidade(p.comprarMil, p.unidade)}</b>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vazio">Nada para repor agora.</p>
        )}
      </section>

      <section className="cartao loja-ultimas">
        <header className="cartao-topo">
          <h2>Últimas vendas</h2>
          <Link className="link" href={`${base}/vendas`}>
            Vendas <Icone nome="seta" />
          </Link>
        </header>
        {ultimas.length ? (
          <ul>
            {ultimas.map((v) => (
              <li key={v.id} data-vivo={`${v.id}:1`}>
                <span className="loja-quando">{v.data === hj ? hora(v.criadoEm) : diaCurto(v.data)}</span>
                <span>
                  <strong>{v.descricao || "Venda"}</strong>
                  <small>
                    {ORIGEM[v.origem] ?? v.origem}
                    {v.status === "a_receber" ? " · a receber" : ""}
                  </small>
                </span>
                <b>{reais(v.valor, true)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vazio">As vendas aparecem aqui na hora.</p>
        )}
      </section>

      <section className="cartao loja-contas">
        <header className="cartao-topo">
          <h2>Contas a pagar</h2>
          <span className="loja-total ruim">{reais(totalPagar)}</span>
        </header>
        {aPagar.length ? (
          <ul>
            {aPagar.map((v) => (
              <li key={v.id} className={v.atrasado ? "atrasado" : ""}>
                <Link href={`${base}/financeiro${v.atrasado ? "?grupo=atrasadas" : ""}#contas`}>
                  <span>
                    <strong>{v.descricao}</strong>
                    <small>{v.atrasado ? `Venceu ${diaCurto(v.data)}` : v.data === hj ? "Vence hoje" : `Vence ${diaCurto(v.data)}`}</small>
                  </span>
                  <b>{reais(v.valor)}</b>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vazio">Nenhuma conta para os próximos dias.</p>
        )}
      </section>

      <section className="cartao loja-contas">
        <header className="cartao-topo">
          <h2>A receber</h2>
          <span className="loja-total bom">{reais(totalReceber)}</span>
        </header>
        {aReceber.length ? (
          <ul>
            {aReceber.map((v) => (
              <li key={v.id} className={v.atrasado ? "atrasado" : ""}>
                <Link href={`${base}/vendas`}>
                  <span>
                    <strong>{v.descricao}</strong>
                    <small>{v.atrasado ? `Era para ${diaCurto(v.data)}` : `Entra ${diaCurto(v.data)}`}</small>
                  </span>
                  <b>{reais(v.valor)}</b>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vazio">Nada a receber: fiado e cartão a prazo aparecem aqui.</p>
        )}
      </section>

      {grafico}
      {atividade}
    </>
  );
}
