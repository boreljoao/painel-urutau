"use client";

/**
 * Editar e excluir lançamentos, cadastrar e editar clientes, e o aviso com "Desfazer".
 * A edição de venda e despesa é guiada pelo endereço (?editar=<id>): a página carrega só aquele
 * lançamento e abre esta janela, então não precisa levar os dados de todas as linhas para o navegador.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { EstadoForm } from "@/lib/estado-form";
import { Icone } from "./Icone";
import { Campo2 as Campo, FormDespesa, FormVenda, useSalvar } from "./lancar";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

interface OpcoesEdicao {
  tipo: "venda" | "despesa";
  inicial: Record<string, string>;
  hoje: string;
  fontes: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  editar: AcaoForm;
  excluir: () => Promise<{ erro?: string }>;
  /** Para onde ir ao fechar, ao salvar e ao excluir. */
  fechar: string;
  aposSalvar: string;
  aposExcluir: string;
  /** De onde a venda veio (caixa, agenda, pátio) e o que excluir faz com ela. */
  origem?: { aviso: string | null; textoExcluir: string };
}

export function EditarLancamento(o: OpcoesEdicao) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    const j = janela.current;
    if (j && !j.open) j.showModal();
  }, []);

  const excluir = () =>
    iniciar(async () => {
      const r = await o.excluir();
      if (r.erro) return setErro(r.erro);
      router.replace(o.aposExcluir, { scroll: false });
    });

  const base = { hoje: o.hoje, fontes: o.fontes, categorias: o.categorias, clientes: o.clientes, salvo: () => router.replace(o.aposSalvar, { scroll: false }) };
  const titulo = o.tipo === "venda" ? "Editar venda" : "Editar despesa";

  return (
    <dialog ref={janela} className="janela" aria-labelledby="editar-titulo" onClose={() => router.replace(o.fechar, { scroll: false })} onClick={(e) => e.target === janela.current && janela.current.close()}>
      <header className="janela-topo">
        <h2 id="editar-titulo">{titulo}</h2>
        <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
          ×
        </button>
      </header>
      {o.origem?.aviso && (
        <p className="janela-aviso" role="note">
          {o.origem.aviso}
        </p>
      )}
      {o.tipo === "venda" ? (
        <FormVenda {...base} inicial={o.inicial} rotulo="Salvar alterações" lancarVenda={o.editar} lancarDespesa={o.editar} />
      ) : (
        <FormDespesa {...base} inicial={o.inicial} rotulo="Salvar alterações" lancarVenda={o.editar} lancarDespesa={o.editar} />
      )}
      <footer className="janela-pe">
        {confirmar ? (
          <>
            <span>{o.origem?.textoExcluir ?? "Excluir este lançamento? Dá para desfazer logo em seguida."}</span>
            <button type="button" className="botao-claro" onClick={() => setConfirmar(false)} disabled={pendente}>
              Não
            </button>
            <button type="button" className="botao-perigo" onClick={excluir} disabled={pendente}>
              {pendente ? "Excluindo…" : "Sim, excluir"}
            </button>
          </>
        ) : (
          <button type="button" className="botao-texto-perigo" onClick={() => setConfirmar(true)}>
            Excluir lançamento
          </button>
        )}
        {erro && (
          <span role="alert" className="erro-pequeno">
            {erro}
          </span>
        )}
      </footer>
    </dialog>
  );
}

/** Aviso no canto da tela, que some sozinho. Com `desfazer`, mostra o botão para voltar atrás. */
export function AvisoPagina({ texto, desfazer, limpar }: { texto: string; desfazer?: () => Promise<{ erro?: string } | void>; limpar: string }) {
  const router = useRouter();
  const [visivel, setVisivel] = useState(true);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      setVisivel(false);
      router.replace(limpar, { scroll: false });
    }, desfazer ? 9000 : 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visivel) return null;
  return (
    <p className="aviso-salvo" role="status">
      <Icone nome="check" />
      {erro ?? texto}
      {desfazer && (
        <button
          type="button"
          className="aviso-desfazer"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await desfazer();
              if (r?.erro) return setErro(r.erro);
              setVisivel(false);
              router.replace(limpar, { scroll: false });
            })
          }
        >
          {pendente ? "…" : "Desfazer"}
        </button>
      )}
    </p>
  );
}

interface OpcoesCliente {
  acao: AcaoForm;
  inicial?: Record<string, string>;
  rotulo: string;
  classe?: string;
  titulo: string;
  /** A lista de clientes (com a busca): depois de salvar, abre a ficha do cliente nela. */
  lista: string;
}

/** Cadastrar um cliente novo ou editar a ficha de um existente. */
export function JanelaCliente({ acao, inicial, rotulo, classe = "botao", titulo, lista }: OpcoesCliente) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [chave, setChave] = useState(0);
  const abrir = () => {
    setChave((k) => k + 1);
    janela.current?.showModal();
  };
  return (
    <>
      <button type="button" className={classe} onClick={abrir}>
        {rotulo}
      </button>
      <dialog ref={janela} className="janela" aria-label={titulo} onClick={(e) => e.target === janela.current && janela.current.close()}>
        <header className="janela-topo">
          <h2>{titulo}</h2>
          <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
            ×
          </button>
        </header>
        <FormCliente
          key={chave}
          acao={acao}
          inicial={inicial}
          salvo={(_, v) => {
            janela.current?.close();
            const url = new URL(lista, location.origin);
            if (v?.id) url.searchParams.set("c", v.id);
            router.push(url.pathname + url.search);
            router.refresh();
          }}
        />
      </dialog>
    </>
  );
}

function FormCliente({ acao, inicial, salvo }: { acao: AcaoForm; inicial?: Record<string, string>; salvo: (t: string, v?: Record<string, string>) => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(acao, salvo, inicial);
  return (
    <form key={versao} action={enviar} className="form-lancar">
      <Campo rotulo="Nome" erro={erros.nome} largo>
        <input name="nome" defaultValue={v.nome} maxLength={120} autoFocus required />
      </Campo>
      <Campo rotulo="Telefone (WhatsApp)" erro={erros.telefone}>
        <input name="telefone" type="tel" inputMode="tel" placeholder="(21) 99999-8888" defaultValue={v.telefone} />
      </Campo>
      <Campo rotulo="E-mail" erro={erros.email}>
        <input name="email" type="email" defaultValue={v.email} />
      </Campo>
      <Campo rotulo="CPF ou CNPJ" erro={erros.documento} largo>
        <input name="documento" inputMode="numeric" defaultValue={v.documento} />
      </Campo>
      <label className="campo-form largo">
        <span>Anotações</span>
        <textarea name="observacao" rows={3} maxLength={1000} defaultValue={v.observacao} />
        {erros.observacao && <em role="alert">{erros.observacao}</em>}
      </label>
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar cliente"}
      </button>
    </form>
  );
}
