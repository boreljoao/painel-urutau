"use client";

/**
 * Cadastrar, editar e vender um carro do pátio. Guiada pelo endereço (?novo=1 ou ?editar=<id>),
 * como a janela da agenda.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { StatusVeiculo } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";
import { Icone } from "@/componentes/Icone";
import { Campo2 as Campo, useSalvar } from "@/componentes/lancar";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;
type AcaoSimples = () => Promise<{ erro?: string } | void>;

const NOMES: Record<StatusVeiculo, string> = { preparacao: "Em preparação", disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido" };

interface Edicao {
  status: StatusVeiculo;
  mudar: Partial<Record<StatusVeiculo, AcaoSimples>>;
  vender: AcaoForm;
  excluir: () => Promise<{ erro?: string }>;
  fontes: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  /** Lucro se vender pelo preço anunciado, para a pessoa ver antes de lançar. */
  custoTotal: number;
}

interface Opcoes {
  titulo: string;
  salvar: AcaoForm;
  inicial: Record<string, string>;
  hoje: string;
  fechar: string;
  edicao?: Edicao;
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const lerCampo = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function JanelaVeiculo(o: Opcoes) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const j = janela.current;
    if (j && !j.open) {
      j.showModal();
      j.scrollTop = 0;
    }
  }, []);
  const irPara = (url: string) => router.replace(url, { scroll: false });

  return (
    <dialog ref={janela} className="janela janela-agenda" aria-labelledby="patio-titulo" onClose={() => irPara(o.fechar)} onClick={(e) => e.target === janela.current && janela.current.close()}>
      <header className="janela-topo">
        <h2 id="patio-titulo">{o.titulo}</h2>
        {o.edicao && <span className={`pilula veiculo-${o.edicao.status}`}>{NOMES[o.edicao.status]}</span>}
        <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
          ×
        </button>
      </header>
      {o.edicao && o.edicao.status !== "vendido" && <Situacao e={o.edicao} />}
      {o.edicao && o.edicao.status !== "vendido" && <Vender e={o.edicao} preco={o.inicial.preco} hoje={o.hoje} />}
      <FormVeiculo {...o} salvo={() => janela.current?.close()} />
      {o.edicao && <Excluir e={o.edicao} fechar={() => janela.current?.close()} />}
    </dialog>
  );
}

function FormVeiculo(o: Opcoes & { salvo: () => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(o.salvar, o.salvo, o.inicial);
  const vendido = o.edicao?.status === "vendido";
  return (
    <form key={versao} action={enviar} className="form-lancar">
      {o.edicao && <h3 className="largo">Dados do carro</h3>}
      <Campo rotulo="Carro (marca, modelo e versão)" erro={erros.modelo} largo>
        <input name="modelo" defaultValue={v.modelo} maxLength={120} required autoFocus={!v.modelo} placeholder="Ex.: Onix LT 1.0 Turbo" />
      </Campo>
      <Campo rotulo="Ano" erro={erros.ano}>
        <input name="ano" inputMode="numeric" defaultValue={v.ano} placeholder="2021" maxLength={4} />
      </Campo>
      <Campo rotulo="Km" erro={erros.km}>
        <input name="km" inputMode="numeric" defaultValue={v.km} placeholder="45.000" />
      </Campo>
      <Campo rotulo="Placa" erro={erros.placa}>
        <input name="placa" defaultValue={v.placa} placeholder="ABC1D23" maxLength={8} style={{ textTransform: "uppercase" }} />
      </Campo>
      <Campo rotulo="Cor" erro={erros.cor}>
        <input name="cor" defaultValue={v.cor} maxLength={40} />
      </Campo>
      <Campo rotulo="Custo de compra (R$)" erro={erros.custoCompra}>
        <input name="custoCompra" inputMode="decimal" placeholder="0,00" defaultValue={v.custoCompra} />
      </Campo>
      <Campo rotulo="Preparação (R$)" erro={erros.custoPreparacao}>
        <input name="custoPreparacao" inputMode="decimal" placeholder="Funilaria, revisão, documentos" defaultValue={v.custoPreparacao} />
      </Campo>
      <Campo rotulo="Preço anunciado (R$)" erro={erros.preco}>
        <input name="preco" inputMode="decimal" placeholder="0,00" defaultValue={v.preco} />
      </Campo>
      <Campo rotulo="Entrou no pátio" erro={erros.entradaEm}>
        <input name="entradaEm" type="date" defaultValue={v.entradaEm ?? o.hoje} max={o.hoje} required />
      </Campo>
      {vendido ? (
        <input type="hidden" name="status" value="disponivel" />
      ) : (
        <Campo rotulo="Situação" erro={erros.status} largo>
          <select name="status" defaultValue={v.status ?? "preparacao"}>
            <option value="preparacao">Em preparação</option>
            <option value="disponivel">Disponível para venda</option>
            <option value="reservado">Reservado</option>
          </select>
        </Campo>
      )}
      <label className="campo-form largo">
        <span>Anotações</span>
        <textarea name="observacao" rows={2} maxLength={1000} defaultValue={v.observacao} />
      </label>
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : o.edicao ? "Salvar alterações" : "Colocar no pátio"}
      </button>
    </form>
  );
}

function Situacao({ e }: { e: Edicao }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const opcoes: StatusVeiculo[] = ["preparacao", "disponivel", "reservado"];
  return (
    <div className="agenda-situacao">
      <div className="alternar" role="group" aria-label="Situação do carro">
        {opcoes.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={e.status === s}
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await e.mudar[s]?.();
                if (r?.erro) return setErro(r.erro);
                router.refresh();
              })
            }
          >
            {NOMES[s]}
          </button>
        ))}
      </div>
      {erro && (
        <span role="alert" className="erro-pequeno">
          {erro}
        </span>
      )}
    </div>
  );
}

/** Vender: a venda vai para as vendas, o caixa e o imposto; o carro sai do pátio com o lucro. */
function Vender({ e, preco, hoje }: { e: Edicao; preco?: string; hoje: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(preco ?? "");
  const [clienteId, setClienteId] = useState("");
  const { erros, v, enviar, pendente, versao } = useSalvar(e.vender, () => router.refresh(), { valor: preco ?? "", status: "recebido", data: hoje });
  const centavos = lerCampo(valor);
  const lucro = centavos == null ? null : centavos - e.custoTotal;
  if (!aberto)
    return (
      <div className="agenda-receber">
        <button type="button" className="botao" onClick={() => setAberto(true)}>
          <Icone nome="vendas" /> Registrar venda
        </button>
        <span className="nota">Vai para as vendas, o caixa e o imposto, com o lucro do carro.</span>
      </div>
    );
  return (
    <form key={versao} action={enviar} className="form-lancar agenda-receber-form">
      <h3 className="largo">Registrar venda</h3>
      <input type="hidden" name="clienteId" value={clienteId} />
      <Campo rotulo="Vendido por (R$)" erro={erros.valor}>
        <input name="valor" inputMode="decimal" placeholder="0,00" defaultValue={v.valor} onChange={(x) => setValor(x.target.value)} required autoFocus />
      </Campo>
      <Campo rotulo="Dia da venda" erro={erros.data}>
        <input name="data" type="date" defaultValue={v.data} max={hoje} required />
      </Campo>
      <Campo rotulo="Como pagou" erro={erros.formaPagamento}>
        <select name="formaPagamento" defaultValue={v.formaPagamento ?? "transferencia"}>
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f.v} value={f.v}>
              {f.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Já recebeu?" erro={erros.status}>
        <select name="status" defaultValue={v.status}>
          <option value="recebido">Já recebi</option>
          <option value="a_receber">Vai pagar depois</option>
        </select>
      </Campo>
      <Campo rotulo="Fonte" erro={erros.fonteReceitaId}>
        <select name="fonteReceitaId" defaultValue={v.fonteReceitaId ?? e.fontes[0]?.id}>
          {e.fontes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Comprador (opcional)" erro={erros.clienteId}>
        <select value={clienteId} onChange={(x) => setClienteId(x.target.value)}>
          <option value="">Sem cadastro</option>
          {e.clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      {lucro != null && (
        <p className={`largo patio-lucro-previo ${lucro < 0 ? "ruim" : ""}`}>
          Custo {reais(e.custoTotal)} · lucro {reais(lucro)}
        </p>
      )}
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Lançando…" : "Lançar venda"}
      </button>
    </form>
  );
}

function Excluir({ e, fechar }: { e: Edicao; fechar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <footer className="janela-pe">
      {confirmar ? (
        <>
          <span>Tirar este carro do pátio? {e.status === "vendido" ? "A venda continua nas vendas." : ""}</span>
          <button type="button" className="botao-claro" onClick={() => setConfirmar(false)} disabled={pendente}>
            Não
          </button>
          <button
            type="button"
            className="botao-perigo"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await e.excluir();
                if (r.erro) return setErro(r.erro);
                fechar();
              })
            }
          >
            {pendente ? "Tirando…" : "Sim, tirar"}
          </button>
        </>
      ) : (
        <button type="button" className="botao-texto-perigo" onClick={() => setConfirmar(true)}>
          Tirar do pátio
        </button>
      )}
      {erro && (
        <span role="alert" className="erro-pequeno">
          {erro}
        </span>
      )}
    </footer>
  );
}
