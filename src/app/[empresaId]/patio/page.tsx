import Link from "next/link";
import type { StatusVeiculo } from "@/db/schema";
import { hoje, intervaloDoMes, mesAtual } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/servidor/acesso";
import { opcoesDaAgenda } from "@/servidor/agenda";
import { type LinhaVeiculo, NOME_STATUS_VEICULO, carrosNoPatio, resumoDoPatio, veiculoDaEmpresa, vendidosEntre } from "@/servidor/patio";
import { excluirVeiculo, mudarStatusVeiculo, salvarVeiculo, venderVeiculo } from "@/pacotes/patio-acoes";
import { JanelaVeiculo } from "@/pacotes/patio-janela";
import { AoVivo } from "@/componentes/AoVivo";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { Entrada } from "@/componentes/vivos";
import { pulsoDaEmpresa } from "../pulso";

export const metadata = { title: "Pátio" };
export const dynamic = "force-dynamic";

type Filtro = "todos" | StatusVeiculo;
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "todos", nome: "No pátio" },
  { id: "disponivel", nome: "Disponíveis" },
  { id: "reservado", nome: "Reservados" },
  { id: "preparacao", nome: "Em preparação" },
  { id: "vendido", nome: "Vendidos no mês" },
];

const emReais = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const pct = (lucro: number, base: number) => (base > 0 ? `${Math.round((lucro / base) * 1000) / 10}%`.replace(".", ",") : "");

function Carro({ c, href }: { c: LinhaVeiculo; href: string }) {
  const base = c.status === "vendido" ? c.valorVendaCentavos : c.precoCentavos;
  const parado = c.status !== "vendido" && c.dias >= 60;
  return (
    <Link href={href} scroll={false} className={`cartao patio-carro veiculo-${c.status}`} data-vivo={`${c.id}:${new Date(c.atualizadoEm).getTime()}`}>
      <header>
        <span className="patio-icone" aria-hidden>
          <Icone nome="carro" />
        </span>
        <span>
          <strong>{c.modelo}</strong>
          <small>{[c.ano, c.km != null ? `${c.km.toLocaleString("pt-BR")} km` : null, c.placa, c.cor].filter(Boolean).join(" · ")}</small>
        </span>
        <span className={`pilula veiculo-${c.status}`}>{NOME_STATUS_VEICULO[c.status]}</span>
      </header>
      <dl>
        <div>
          <dt>Custo total</dt>
          <dd>{reais(c.custoTotal)}</dd>
        </div>
        <div>
          <dt>{c.status === "vendido" ? "Vendido por" : "Preço"}</dt>
          <dd>{base == null ? "—" : reais(base)}</dd>
        </div>
        <div>
          <dt>{c.status === "vendido" ? "Lucro" : "Margem prevista"}</dt>
          <dd className={c.lucro != null && c.lucro < 0 ? "ruim" : "bom"}>
            {c.lucro == null ? "—" : reais(c.lucro)}
            {c.lucro != null && base ? <small> {pct(c.lucro, base)}</small> : null}
          </dd>
        </div>
      </dl>
      <footer className={parado ? "alerta" : ""}>
        <Icone nome={parado ? "alerta" : "relogio"} />
        {c.status === "vendido" ? `Vendido em ${c.dias} ${c.dias === 1 ? "dia" : "dias"} de pátio` : c.dias === 0 ? "Entrou hoje" : `${c.dias} ${c.dias === 1 ? "dia" : "dias"} no pátio${parado ? " · capital parado" : ""}`}
      </footer>
    </Link>
  );
}

export default async function Patio({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ ver?: string; novo?: string; editar?: string }> }) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const podeLancar = pode(ctx.papel, "lancar");
  const filtro: Filtro = FILTROS.some((f) => f.id === sp.ver) ? (sp.ver as Filtro) : "todos";
  const hj = hoje();
  const { inicio, fim } = intervaloDoMes(mesAtual());
  const abrindo = podeLancar && (!!sp.novo || !!sp.editar);
  const [noPatio, vendidos, editando, opcoes] = await Promise.all([
    carrosNoPatio(empresaId),
    vendidosEntre(empresaId, inicio, fim),
    sp.editar && podeLancar ? veiculoDaEmpresa(empresaId, sp.editar) : null,
    abrindo ? opcoesDaAgenda(empresaId) : null,
  ]);
  const r = resumoDoPatio(noPatio);
  const lista = filtro === "vendido" ? vendidos : filtro === "todos" ? noPatio : noPatio.filter((c) => c.status === filtro);
  const contagem: Record<Filtro, number> = { todos: noPatio.length, disponivel: r.disponiveis, reservado: r.reservados, preparacao: r.preparacao, vendido: vendidos.length };
  const base = `/${empresaId}/patio`;
  const link = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(filtro !== "todos" ? { ver: filtro } : {}), ...extra });
    return q.size ? `${base}?${q}` : base;
  };
  const lucroMes = vendidos.reduce((t, c) => t + (c.lucro ?? 0), 0);

  let janela: React.ReactNode = null;
  if (abrindo && opcoes) {
    if (editando) {
      const custoTotal = editando.custoCompraCentavos + editando.custoPreparacaoCentavos;
      const id = editando.id;
      janela = (
        <JanelaVeiculo
          titulo={editando.modelo}
          salvar={salvarVeiculo.bind(null, empresaId, id)}
          inicial={{
            modelo: editando.modelo,
            ano: editando.ano ? String(editando.ano) : "",
            km: editando.km != null ? String(editando.km) : "",
            placa: editando.placa ?? "",
            cor: editando.cor ?? "",
            custoCompra: emReais(editando.custoCompraCentavos || null),
            custoPreparacao: emReais(editando.custoPreparacaoCentavos || null),
            preco: emReais(editando.precoCentavos),
            entradaEm: editando.entradaEm,
            status: editando.status,
            observacao: editando.observacao,
          }}
          hoje={hj}
          fechar={link({})}
          edicao={{
            status: editando.status,
            mudar: Object.fromEntries((["preparacao", "disponivel", "reservado"] as const).map((s) => [s, mudarStatusVeiculo.bind(null, empresaId, id, s)])),
            vender: venderVeiculo.bind(null, empresaId, id),
            excluir: excluirVeiculo.bind(null, empresaId, id),
            fontes: opcoes.fontes,
            clientes: opcoes.clientes,
            custoTotal,
          }}
        />
      );
    } else if (sp.novo) {
      janela = <JanelaVeiculo titulo="Carro novo no pátio" salvar={salvarVeiculo.bind(null, empresaId, null)} inicial={{ entradaEm: hj, status: "preparacao" }} hoje={hj} fechar={link({})} />;
    }
  }

  return (
    <div className="patio">
      <header className="agenda2-topo">
        <div>
          <h1>Pátio</h1>
          <p>
            {noPatio.length} {noPatio.length === 1 ? "carro" : "carros"} · {reais(r.capitalParado)} investidos
          </p>
        </div>
        <div className="topo-acoes">
          <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
          {podeLancar && (
            <Link className="botao" href={link({ novo: "1" })} scroll={false}>
              + Carro no pátio
            </Link>
          )}
        </div>
      </header>

      <section className="patio-resumo" aria-label="Resumo do pátio">
        <div className="cartao">
          <span>Disponíveis</span>
          <strong>{r.disponiveis}</strong>
        </div>
        <div className="cartao">
          <span>Reservados</span>
          <strong>{r.reservados}</strong>
        </div>
        <div className="cartao">
          <span>Em preparação</span>
          <strong>{r.preparacao}</strong>
        </div>
        <div className={`cartao ${r.parados60 ? "alerta" : ""}`}>
          <span>Parados há 60+ dias</span>
          <strong>{r.parados60}</strong>
        </div>
        <div className="cartao">
          <span>Lucro dos vendidos no mês</span>
          <strong className={lucroMes < 0 ? "ruim" : "bom"}>{reais(lucroMes)}</strong>
        </div>
      </section>

      <nav className="agenda2-chips" aria-label="Filtrar">
        {FILTROS.map((f) => (
          <Link key={f.id} href={f.id === "todos" ? base : `${base}?ver=${f.id}`} className={`agenda2-chip${filtro === f.id ? " ativo" : ""}`} aria-current={filtro === f.id ? "page" : undefined}>
            {f.nome} <b>{contagem[f.id]}</b>
          </Link>
        ))}
      </nav>

      {lista.length ? (
        <Entrada className="patio-grade">
          {lista.map((c) => (
            <Carro key={c.id} c={c} href={podeLancar ? link({ editar: c.id }) : link({})} />
          ))}
        </Entrada>
      ) : (
        <section className="cartao vazio-grande">
          <Icone nome="carro" />
          <p>{filtro === "vendido" ? "Nenhum carro vendido neste mês." : filtro === "todos" ? "O pátio está vazio. Cadastre o primeiro carro com o custo e o preço para ver a margem." : "Nenhum carro nesta situação."}</p>
          {podeLancar && filtro === "todos" && (
            <Link className="botao" href={link({ novo: "1" })} scroll={false}>
              + Carro no pátio
            </Link>
          )}
        </section>
      )}
      {janela}
    </div>
  );
}
