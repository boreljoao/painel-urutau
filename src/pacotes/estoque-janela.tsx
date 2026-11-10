"use client";

/** Cadastrar e editar um produto; registrar a chegada de mercadoria e a baixa (perda, quebra, uso). */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Unidade } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { UNIDADES } from "@/lib/estoque";
import { Icone } from "@/componentes/Icone";
import { Campo2 as Campo, useSalvar } from "@/componentes/lancar";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

interface Opcoes {
  titulo: string;
  salvar: AcaoForm;
  inicial: Record<string, string>;
  categorias: string[];
  fechar: string;
  hoje: string;
  /** Na edição: entrada e baixa de estoque. */
  edicao?: { unidade: Unidade; controla: boolean; saldo: string; entrada: AcaoForm; perda: AcaoForm };
}

export function JanelaProduto(o: Opcoes) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const j = janela.current;
    if (j && !j.open) {
      j.showModal();
      j.scrollTop = 0;
    }
  }, []);
  return (
    <dialog ref={janela} className="janela janela-agenda" aria-labelledby="produto-titulo" onClose={() => router.replace(o.fechar, { scroll: false })} onClick={(e) => e.target === janela.current && janela.current.close()}>
      <header className="janela-topo">
        <h2 id="produto-titulo">{o.titulo}</h2>
        {o.edicao?.controla && <span className="pilula">{o.edicao.saldo} em estoque</span>}
        <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
          ×
        </button>
      </header>
      {o.edicao?.controla && <Movimento acao={o.edicao.entrada} tipo="entrada" unidade={o.edicao.unidade} hoje={o.hoje} />}
      <FormProduto {...o} salvo={() => janela.current?.close()} />
      {o.edicao?.controla && <Movimento acao={o.edicao.perda} tipo="perda" unidade={o.edicao.unidade} hoje={o.hoje} />}
    </dialog>
  );
}

function FormProduto(o: Opcoes & { salvo: () => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(o.salvar, o.salvo, o.inicial);
  const [controla, setControla] = useState(v.controlaEstoque !== "");
  return (
    <form key={versao} action={enviar} className="form-lancar">
      {o.edicao && <h3 className="largo">Dados do produto</h3>}
      <Campo rotulo="Nome do produto" erro={erros.nome} largo>
        <input name="nome" defaultValue={v.nome} maxLength={200} required autoFocus={!v.nome} placeholder="Ex.: Camiseta básica branca M" />
      </Campo>
      <Campo rotulo="Código de barras" erro={erros.codigoBarras}>
        <input name="codigoBarras" defaultValue={v.codigoBarras} inputMode="numeric" placeholder="Passe o leitor aqui" />
      </Campo>
      <Campo rotulo="Código interno (SKU)" erro={erros.sku}>
        <input name="sku" defaultValue={v.sku} maxLength={60} />
      </Campo>
      <Campo rotulo="Categoria" erro={erros.categoria}>
        <input name="categoria" list="produto-categorias" defaultValue={v.categoria} maxLength={60} />
        <datalist id="produto-categorias">
          {o.categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Campo>
      <Campo rotulo="Vende por" erro={erros.unidade}>
        <select name="unidade" defaultValue={v.unidade ?? "un"} disabled={!!o.edicao}>
          {Object.entries(UNIDADES).map(([id, u]) => (
            <option key={id} value={id}>
              {u.nome}
            </option>
          ))}
        </select>
        {o.edicao && <input type="hidden" name="unidade" value={v.unidade} />}
      </Campo>
      <Campo rotulo="Preço de venda (R$)" erro={erros.preco}>
        <input name="preco" inputMode="decimal" defaultValue={v.preco} placeholder="0,00" required />
      </Campo>
      <Campo rotulo="Estoque mínimo" erro={erros.minimo}>
        <input name="minimo" inputMode="decimal" defaultValue={v.minimo} placeholder="Avisa quando chegar nele" />
      </Campo>
      {!o.edicao && controla && (
        <>
          <Campo rotulo="Quantidade que tem hoje" erro={erros.saldoInicial}>
            <input name="saldoInicial" inputMode="decimal" defaultValue={v.saldoInicial} placeholder="0" />
          </Campo>
          <Campo rotulo="Custo de cada um (R$)" erro={erros.custoInicial}>
            <input name="custoInicial" inputMode="decimal" defaultValue={v.custoInicial} placeholder="0,00" />
          </Campo>
        </>
      )}
      <label className="campo-check largo">
        <input type="checkbox" name="controlaEstoque" checked={controla} onChange={(e) => setControla(e.target.checked)} />
        <span>Controlar estoque (a venda dá baixa na quantidade)</span>
      </label>
      {o.edicao && (
        <label className="campo-check largo">
          <input type="checkbox" name="ativo" defaultChecked={v.ativo !== ""} />
          <span>Ativo no caixa</span>
        </label>
      )}
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : o.edicao ? "Salvar produto" : "Cadastrar produto"}
      </button>
    </form>
  );
}

/** Entrada (chegou mercadoria) ou baixa (perda, quebra, uso interno). */
function Movimento({ acao, tipo, unidade, hoje }: { acao: AcaoForm; tipo: "entrada" | "perda"; unidade: Unidade; hoje: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [lancar, setLancar] = useState("nao");
  const { erros, v, enviar, pendente, versao } = useSalvar(
    acao,
    () => {
      setAberto(false);
      router.refresh();
    },
    {},
  );
  const un = UNIDADES[unidade].curto;
  if (!aberto)
    return tipo === "entrada" ? (
      <div className="agenda-receber">
        <button type="button" className="botao" onClick={() => setAberto(true)}>
          <Icone nome="caixa" /> Chegou mercadoria
        </button>
        <span className="nota">Soma ao estoque e refaz o custo médio.</span>
      </div>
    ) : (
      <footer className="janela-pe">
        <button type="button" className="botao-texto-perigo" onClick={() => setAberto(true)}>
          Dar baixa (perda, quebra, uso)
        </button>
      </footer>
    );
  return (
    <form key={versao} action={enviar} className="form-lancar agenda-receber-form">
      <h3 className="largo">{tipo === "entrada" ? "Chegou mercadoria" : "Dar baixa"}</h3>
      <Campo rotulo={`Quantidade (${un})`} erro={erros.quantidade}>
        <input name="quantidade" inputMode="decimal" defaultValue={v.quantidade} required autoFocus />
      </Campo>
      {tipo === "entrada" ? (
        <>
          <Campo rotulo={`Custo por ${un} (R$)`} erro={erros.custo}>
            <input name="custo" inputMode="decimal" defaultValue={v.custo} placeholder="0,00" required />
          </Campo>
          <Campo rotulo="Fornecedor" erro={erros.fornecedor}>
            <input name="fornecedor" defaultValue={v.fornecedor} maxLength={120} />
          </Campo>
          <Campo rotulo="Nota fiscal" erro={erros.documento}>
            <input name="documento" defaultValue={v.documento} maxLength={60} />
          </Campo>
          <Campo rotulo="Lançar a compra nas contas?" erro={erros.lancar} largo>
            <select name="lancar" value={lancar} onChange={(e) => setLancar(e.target.value)}>
              <option value="nao">Não lançar</option>
              <option value="pago">Sim, já paguei</option>
              <option value="a_pagar">Sim, vou pagar depois</option>
            </select>
          </Campo>
          {lancar === "a_pagar" && (
            <Campo rotulo="Vencimento" erro={erros.vencimento}>
              <input name="vencimento" type="date" min={hoje} defaultValue={v.vencimento} required />
            </Campo>
          )}
        </>
      ) : (
        <Campo rotulo="Motivo" erro={erros.motivo}>
          <input name="motivo" defaultValue={v.motivo} maxLength={200} placeholder="Ex.: venceu, quebrou" />
        </Campo>
      )}
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className={tipo === "entrada" ? "botao largo" : "botao-perigo largo"} disabled={pendente}>
        {pendente ? "Salvando…" : tipo === "entrada" ? "Registrar entrada" : "Registrar baixa"}
      </button>
    </form>
  );
}
