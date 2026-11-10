import Link from "next/link";
import { obterDb } from "@/db";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";
import { pode } from "@/lib/permissoes";
import { opcoesDeClientes } from "@/lib/servidor/clientes";
import { caixaDoDia, produtosDoCaixa } from "@/lib/servidor/estoque";
import { exigirAcesso } from "@/servidor/acesso";
import { cancelarVendaAcao, venderAcao } from "@/pacotes/estoque-acoes";
import { CaixaPdv } from "@/pacotes/CaixaPdv";
import { AoVivo } from "@/componentes/AoVivo";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { BotaoAcao } from "@/componentes/vivos";
import { pulsoDaEmpresa } from "../pulso";

export const metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

const NOME_FORMA = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f.v, f.nome])) as Record<string, string>;
const hora = (d: Date) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export default async function Caixa({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const ctx = await exigirAcesso(empresaId, "lancar");
  const db = obterDb();
  const [produtos, clientes, dia] = await Promise.all([produtosDoCaixa(db, empresaId), opcoesDeClientes(db, empresaId), caixaDoDia(db, empresaId)]);
  const podeEstornar = pode(ctx.papel, "gerenciar");

  return (
    <div className="caixa">
      <header className="agenda2-topo">
        <div>
          <h1>Caixa</h1>
          <p>Passe o código no leitor ou busque pelo nome. Ctrl + Enter fecha a venda.</p>
        </div>
        <div className="topo-acoes">
          <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
          <Link className="botao-claro" href={`/${empresaId}/estoque`}>
            <Icone nome="caixa" /> Estoque
          </Link>
        </div>
      </header>

      <div className="caixa-grade">
        <section className="cartao">
          <CaixaPdv produtos={produtos} clientes={clientes} vender={venderAcao.bind(null, empresaId)} base={`/${empresaId}`} />
        </section>

        <aside className="cartao caixa-dia">
          <h2>Caixa de hoje</h2>
          <div className="caixa-dia-total">
            <strong>{reais(dia.total, true)}</strong>
            <span>
              {dia.lista.length} {dia.lista.length === 1 ? "venda" : "vendas"} · ticket médio {reais(dia.ticketMedio, true)}
            </span>
          </div>
          {dia.porForma.length > 0 && (
            <ul className="caixa-formas">
              {dia.porForma.map(([f, v]) => (
                <li key={f}>
                  <span>{NOME_FORMA[f] ?? f}</span>
                  <b>{reais(v, true)}</b>
                </li>
              ))}
            </ul>
          )}
          <h3>Últimas vendas</h3>
          {dia.lista.length ? (
            <ol className="caixa-vendas">
              {dia.lista.slice(0, 15).map((v) => (
                <li key={v.id} data-vivo={`${v.id}:1`}>
                  <span>
                    <strong>{reais(v.valor, true)}</strong>
                    <small>
                      {hora(v.criadoEm)} · {NOME_FORMA[v.formaPagamento] ?? v.formaPagamento}
                      {v.status === "a_receber" ? " · fiado" : ""} · {v.itens} {v.itens === 1 ? "item" : "itens"}
                    </small>
                  </span>
                  {podeEstornar && <BotaoAcao acao={cancelarVendaAcao.bind(null, empresaId, v.id)} rotulo="Estornar" icone={null} classe="botao-pequeno botao-pequeno-apagado" />}
                </li>
              ))}
            </ol>
          ) : (
            <p className="vazio">Nenhuma venda no caixa hoje.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
