import Link from "next/link";
import { hoje, somarDias } from "@/lib/datas";
import { ehDemo } from "@/lib/demo";
import { NOME_RESULTADO } from "@/lib/recuperacao";
import { pode } from "@/lib/permissoes";
import { contatosRecentes, listaParaChamar, resumoRecuperacao } from "@/lib/servidor/recuperacao";
import { obterDb } from "@/db";
import { exigirAcesso } from "@/servidor/acesso";
import { pacoteDe } from "@/pacotes/catalogo";
import { RecuperarClientes } from "@/pacotes/RecuperarClientes";
import { reais } from "@/componentes/formato";

export const metadata = { title: "Clientes para chamar" };
export const dynamic = "force-dynamic";

const diaCurto = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

/**
 * Quem parou de comprar, por que vale chamar e uma mensagem pronta para revisar. A equipe manda
 * pelo WhatsApp, confirma e depois marca o que deu. A venda só conta como resultado quando é
 * ligada ao contato.
 */
export default async function Recuperar({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const podeChamar = pode(ctx.papel, "lancar");
  const vocab = pacoteDe(ctx.empresa.perfil).vocab.clientes;
  const db = obterDb();
  const hj = hoje();
  const demo = ehDemo(ctx.usuario.email);
  const [lista, recentes, resumo] = await Promise.all([
    podeChamar ? listaParaChamar(db, ctx.empresa, hj, demo ? null : ctx.usuario.nome) : [],
    contatosRecentes(db, empresaId, hj),
    resumoRecuperacao(db, empresaId, somarDias(hj, -90)),
  ]);
  const aguardando = recentes.filter((c) => c.resultado === "enviado");
  const feitos = recentes.filter((c) => c.resultado !== "enviado").slice(0, 12);
  const taxa = resumo.enviados ? Math.round((resumo.responderam / resumo.enviados) * 100) : null;

  return (
    <div className="recuperar">
      <header className="agenda2-topo">
        <div>
          <h1>{vocab} para chamar</h1>
          <p>Quem parou de comprar no ritmo de sempre. Revise a mensagem, mande pelo WhatsApp e marque o que deu.</p>
        </div>
        <Link className="botao-claro" href={`/${empresaId}/clientes`}>
          {vocab}
        </Link>
      </header>

      <section className="patio-resumo" aria-label="Resultado dos últimos 90 dias">
        <div className="cartao">
          <span>Chamados (90 dias)</span>
          <strong>{resumo.enviados}</strong>
        </div>
        <div className="cartao">
          <span>Responderam</span>
          <strong>{resumo.responderam}</strong>
          {taxa != null && <small>{taxa}% dos chamados</small>}
        </div>
        <div className="cartao">
          <span>Voltaram a comprar</span>
          <strong>{resumo.compraram}</strong>
          {resumo.agendaram > 0 && <small>{resumo.agendaram} agendaram</small>}
        </div>
        <div className="cartao">
          <span>Vendido com os contatos</span>
          <strong className="bom">{reais(resumo.vendido)}</strong>
          <small>Só vendas ligadas a um contato</small>
        </div>
      </section>

      {podeChamar ? (
        <RecuperarClientes
          empresaId={empresaId}
          lista={lista.map(({ clienteId, nome, telefone, motivo, porque, compras, gastoCentavos, ultimaCompra, mensagem }) => ({ clienteId, nome, telefone, motivo, porque, compras, gastoCentavos, ultimaCompra, mensagem }))}
          aguardando={aguardando.map(({ id, clienteId, nome, telefone, porque, dia, vendasParaLigar }) => ({ id, clienteId, nome, telefone, porque, dia, vendasParaLigar }))}
          semWhatsapp={demo}
        />
      ) : (
        <p className="nota">Quem pode lançar vendas vê a lista de quem chamar.</p>
      )}

      {feitos.length > 0 && (
        <section className="cartao rec-feitos" aria-labelledby="rec-feitos">
          <header className="cartao-topo">
            <h2 id="rec-feitos">Resultados recentes</h2>
          </header>
          <ul>
            {feitos.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{c.nome}</strong>
                  <small>Chamado em {diaCurto(c.dia)}</small>
                </span>
                <span className={`pilula rec-res-${c.resultado}`}>{NOME_RESULTADO[c.resultado]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="nota rec-rodape">
        A lista não manda nada sozinha. Quem pediu para não receber, quem tem horário marcado e quem foi chamado nos últimos 30 dias fica de fora.
      </p>
    </div>
  );
}
