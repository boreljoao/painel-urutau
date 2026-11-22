"use client";

/** Novo contrato de locação (?novo=1 em Locações). */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EstadoForm } from "@/lib/estado-form";
import { GARANTIAS, INDICES } from "@/lib/imobiliaria";
import { Campo2 as Campo, useSalvar } from "@/componentes/lancar";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

interface ImovelOp {
  id: string;
  rotulo: string;
  aluguel: string;
  proprietarioId: string;
}

const lerCampo = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function JanelaContrato({ salvar, fechar, hoje, imoveis, clientes }: { salvar: AcaoForm; fechar: string; hoje: string; imoveis: ImovelOp[]; clientes: { id: string; nome: string }[] }) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const j = janela.current;
    if (j && !j.open) j.showModal();
  }, []);
  const fim30 = `${Number(hoje.slice(0, 4)) + 2}${hoje.slice(4)}`;
  const { erros, v, enviar, pendente, versao } = useSalvar(salvar, () => janela.current?.close(), { inicio: hoje, fim: fim30, taxa: "10", dia: "10", indice: "IGP-M" });
  const [imovelId, setImovelId] = useState(v.imovelId ?? "");
  const escolhido = imoveis.find((i) => i.id === imovelId);
  const [aluguel, setAluguel] = useState(v.aluguel ?? "");
  const [taxa, setTaxa] = useState(v.taxa ?? "10");
  const c = lerCampo(aluguel || escolhido?.aluguel || "");
  const t = Number(taxa.replace(",", "."));
  const taxaC = c != null && Number.isFinite(t) ? Math.round((c * t) / 100) : null;

  return (
    <dialog ref={janela} className="janela janela-agenda" aria-labelledby="contrato-titulo" onClose={() => router.replace(fechar, { scroll: false })} onClick={(e) => e.target === janela.current && janela.current.close()}>
      <header className="janela-topo">
        <h2 id="contrato-titulo">Novo contrato de locação</h2>
        <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
          ×
        </button>
      </header>
      <form key={versao} action={enviar} className="form-lancar">
        <Campo rotulo="Imóvel" erro={erros.imovelId} largo>
          <select name="imovelId" value={imovelId} onChange={(e) => setImovelId(e.target.value)} required>
            <option value="">Escolha o imóvel</option>
            {imoveis.map((i) => (
              <option key={i.id} value={i.id}>
                {i.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Inquilino" erro={erros.inquilinoId}>
          <select name="inquilinoId" defaultValue={v.inquilinoId ?? ""} required>
            <option value="">Escolha</option>
            {clientes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Proprietário" erro={erros.proprietarioId}>
          <select name="proprietarioId" key={escolhido?.id ?? "nenhum"} defaultValue={v.proprietarioId ?? escolhido?.proprietarioId ?? ""}>
            <option value="">Sem cadastro</option>
            {clientes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Aluguel (R$)" erro={erros.aluguel}>
          <input name="aluguel" key={escolhido?.id ?? "a"} inputMode="decimal" defaultValue={v.aluguel ?? escolhido?.aluguel ?? ""} onChange={(e) => setAluguel(e.target.value)} required />
        </Campo>
        <Campo rotulo="Taxa de administração (%)" erro={erros.taxa}>
          <input name="taxa" inputMode="decimal" defaultValue={v.taxa} onChange={(e) => setTaxa(e.target.value)} />
        </Campo>
        <Campo rotulo="Início" erro={erros.inicio}>
          <input name="inicio" type="date" defaultValue={v.inicio} required />
        </Campo>
        <Campo rotulo="Fim" erro={erros.fim}>
          <input name="fim" type="date" defaultValue={v.fim} required />
        </Campo>
        <Campo rotulo="Vence todo dia" erro={erros.dia}>
          <input name="dia" inputMode="numeric" defaultValue={v.dia} />
        </Campo>
        <Campo rotulo="Reajuste anual por" erro={erros.indice}>
          <select name="indice" defaultValue={v.indice}>
            {INDICES.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Garantia" erro={erros.garantia} largo>
          <select name="garantia" defaultValue={v.garantia ?? ""}>
            <option value="">Não informada</option>
            {GARANTIAS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Campo>
        {c != null && taxaC != null && c > 0 && (
          <p className="negocio-comissao largo">
            Todo mês: imobiliária fica com <b>{reais(taxaC)}</b> e repassa <b>{reais(c - taxaC)}</b> ao proprietário.
          </p>
        )}
        {erros._ && (
          <p className="erro-pequeno largo" role="alert">
            {erros._}
          </p>
        )}
        <button className="botao largo" disabled={pendente}>
          {pendente ? "Salvando…" : "Cadastrar contrato"}
        </button>
      </form>
    </dialog>
  );
}
