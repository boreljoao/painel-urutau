"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import type { EstadoForm } from "@/lib/estado-form";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";
import { Icone } from "./Icone";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;
type Tipo = "venda" | "despesa";

interface Opcoes {
  hoje: string;
  fontes: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  lancarVenda: AcaoForm;
  lancarDespesa: AcaoForm;
}

/** O botão "Lançar" das telas: abre a janela com venda e despesa, grava e atualiza os números. */
export function Lancar({ inicial = "venda", ...o }: Opcoes & { inicial?: Tipo }) {
  const janela = useRef<HTMLDialogElement>(null);
  const [tipo, setTipo] = useState<Tipo>(inicial);
  const [chave, setChave] = useState(0);
  const [aviso, setAviso] = useState<string>();
  const router = useRouter();

  const abrir = () => {
    setTipo(inicial);
    setChave((k) => k + 1); // formulário limpo a cada vez que abre
    janela.current?.showModal();
  };
  const salvo = (texto: string) => {
    janela.current?.close();
    setAviso(texto);
    router.refresh();
    setTimeout(() => setAviso(undefined), 3500);
  };

  return (
    <>
      <button type="button" className="botao" onClick={abrir}>
        <span aria-hidden>+</span> Lançar
      </button>
      {aviso && (
        <p className="aviso-salvo" role="status">
          <Icone nome="check" />
          {aviso}
        </p>
      )}
      <dialog ref={janela} className="janela" aria-labelledby="lancar-titulo" onClick={(e) => e.target === janela.current && janela.current.close()}>
        <header className="janela-topo">
          <h2 id="lancar-titulo">Lançar</h2>
          <div className="alternar" role="group" aria-label="O que lançar">
            <button type="button" aria-pressed={tipo === "venda"} onClick={() => setTipo("venda")}>
              Venda
            </button>
            <button type="button" aria-pressed={tipo === "despesa"} onClick={() => setTipo("despesa")}>
              Despesa
            </button>
          </div>
          <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
            ×
          </button>
        </header>
        {tipo === "venda" ? <FormVenda key={`v${chave}`} {...o} salvo={salvo} /> : <FormDespesa key={`d${chave}`} {...o} salvo={salvo} />}
      </dialog>
    </>
  );
}

function Campo({ rotulo, erro, children, largo }: { rotulo: string; erro?: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <label className={`campo-form ${largo ? "largo" : ""}`}>
      <span>{rotulo}</span>
      {children}
      {erro && <em role="alert">{erro}</em>}
    </label>
  );
}

function useSalvar(acao: AcaoForm, salvo: (t: string) => void) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  // O React limpa o formulário depois de enviar; com erro, remonta com o que a pessoa tinha digitado.
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (estado.ok) salvo(estado.ok);
    else if (estado.erros) setVersao((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);
  return { erros: estado.erros ?? {}, v: estado.valores ?? {}, enviar, pendente, versao };
}

function FormVenda({ hoje, fontes, clientes, lancarVenda, salvo }: Opcoes & { salvo: (t: string) => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(lancarVenda, salvo);
  const [status, setStatus] = useState(v.status ?? "recebido");
  return (
    <form key={versao} action={enviar} className="form-lancar">
      <Campo rotulo="Valor (R$)" erro={erros.valor}>
        <input name="valor" inputMode="decimal" placeholder="0,00" defaultValue={v.valor} autoFocus required />
      </Campo>
      <Campo rotulo="Dia da venda" erro={erros.data}>
        <input name="data" type="date" defaultValue={v.data ?? hoje} max={hoje} required />
      </Campo>
      <Campo rotulo="O que foi vendido" erro={erros.descricao} largo>
        <input name="descricao" placeholder="Ex.: bolo de cenoura inteiro" defaultValue={v.descricao} maxLength={200} />
      </Campo>
      <Campo rotulo="De onde veio" erro={erros.fonteReceitaId}>
        <select name="fonteReceitaId" defaultValue={v.fonteReceitaId ?? fontes[0]?.id}>
          {fontes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Forma de pagamento" erro={erros.formaPagamento}>
        <select name="formaPagamento" defaultValue={v.formaPagamento ?? "pix"}>
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f.v} value={f.v}>
              {f.nome}
            </option>
          ))}
        </select>
      </Campo>
      <fieldset className="campo-form largo escolha">
        <legend>Já recebeu?</legend>
        <label>
          <input type="radio" name="status" value="recebido" checked={status === "recebido"} onChange={() => setStatus("recebido")} /> Já entrou no caixa
        </label>
        <label>
          <input type="radio" name="status" value="a_receber" checked={status === "a_receber"} onChange={() => setStatus("a_receber")} /> Vai receber depois
        </label>
      </fieldset>
      {status === "a_receber" && (
        <Campo rotulo="Quando vai receber" erro={erros.dataRecebimento}>
          <input name="dataRecebimento" type="date" defaultValue={v.dataRecebimento} min={hoje} required />
        </Campo>
      )}
      <Campo rotulo="Cliente (opcional)" erro={erros.clienteId}>
        <select name="clienteId" defaultValue={v.clienteId ?? ""}>
          <option value="">Sem cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar venda"}
      </button>
    </form>
  );
}

function FormDespesa({ hoje, categorias, lancarDespesa, salvo }: Opcoes & { salvo: (t: string) => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(lancarDespesa, salvo);
  const [status, setStatus] = useState(v.status ?? "pago");
  return (
    <form key={versao} action={enviar} className="form-lancar">
      <Campo rotulo="Valor (R$)" erro={erros.valor}>
        <input name="valor" inputMode="decimal" placeholder="0,00" defaultValue={v.valor} autoFocus required />
      </Campo>
      <Campo rotulo="Dia da despesa" erro={erros.data}>
        <input name="data" type="date" defaultValue={v.data ?? hoje} required />
      </Campo>
      <Campo rotulo="Com o quê" erro={erros.descricao} largo>
        <input name="descricao" placeholder="Ex.: farinha do moinho" defaultValue={v.descricao} maxLength={200} />
      </Campo>
      <Campo rotulo="Categoria" erro={erros.categoriaId} largo>
        <select name="categoriaId" defaultValue={v.categoriaId ?? ""} required>
          <option value="" disabled>
            Escolha
          </option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      <fieldset className="campo-form largo escolha">
        <legend>Já pagou?</legend>
        <label>
          <input type="radio" name="status" value="pago" checked={status === "pago"} onChange={() => setStatus("pago")} /> Já saiu do caixa
        </label>
        <label>
          <input type="radio" name="status" value="a_pagar" checked={status === "a_pagar"} onChange={() => setStatus("a_pagar")} /> Vai pagar depois
        </label>
      </fieldset>
      {status === "a_pagar" && (
        <Campo rotulo="Vencimento" erro={erros.vencimento}>
          <input name="vencimento" type="date" defaultValue={v.vencimento ?? hoje} required />
        </Campo>
      )}
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar despesa"}
      </button>
    </form>
  );
}
