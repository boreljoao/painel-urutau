"use client";

/**
 * Cadastrar e editar um imóvel. Guiada pelo endereço (?novo=1 ou ?editar=<id>), como o pátio.
 * Na edição: a situação (disponível, reservado…), a ficha pronta para o WhatsApp e excluir.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { StatusImovel } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { NOME_STATUS_IMOVEL, NOME_TIPO, TIPOS_IMOVEL } from "@/lib/imobiliaria";
import { Icone } from "@/componentes/Icone";
import { Campo2 as Campo, useSalvar } from "@/componentes/lancar";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

interface Edicao {
  status: StatusImovel;
  mudar: (s: StatusImovel) => Promise<{ erro?: string }>;
  excluir?: () => Promise<{ erro?: string }>;
  ficha: string;
}

interface Opcoes {
  titulo: string;
  salvar: AcaoForm;
  inicial: Record<string, string>;
  hoje: string;
  fechar: string;
  proprietarios: { id: string; nome: string }[];
  edicao?: Edicao;
}

export function JanelaImovel(o: Opcoes) {
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
    <dialog ref={janela} className="janela janela-agenda janela-imovel" aria-labelledby="imovel-titulo" onClose={() => router.replace(o.fechar, { scroll: false })} onClick={(e) => e.target === janela.current && janela.current.close()}>
      <header className="janela-topo">
        <h2 id="imovel-titulo">{o.titulo}</h2>
        {o.edicao && <span className={`pilula imovel-st-${o.edicao.status}`}>{NOME_STATUS_IMOVEL[o.edicao.status]}</span>}
        <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
          ×
        </button>
      </header>
      {o.edicao && <Situacao e={o.edicao} />}
      {o.edicao && <Ficha texto={o.edicao.ficha} />}
      <FormImovel {...o} salvo={() => janela.current?.close()} />
      {o.edicao?.excluir && <Excluir excluir={o.edicao.excluir} fechar={() => janela.current?.close()} />}
    </dialog>
  );
}

function Situacao({ e }: { e: Edicao }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const opcoes: StatusImovel[] = ["disponivel", "reservado", "alugado", "vendido", "suspenso"];
  return (
    <div className="agenda-situacao">
      <div className="alternar" role="group" aria-label="Situação do imóvel">
        {opcoes.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={e.status === s}
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await e.mudar(s);
                if (r.erro) return setErro(r.erro);
                router.refresh();
              })
            }
          >
            {NOME_STATUS_IMOVEL[s]}
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

/** A ficha que o corretor manda ao cliente: copiar ou abrir o WhatsApp já com o texto. */
function Ficha({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <details className="imovel-ficha">
      <summary>
        <Icone nome="whatsapp" /> Ficha para mandar ao cliente
      </summary>
      <pre>{texto}</pre>
      <div className="imovel-ficha-acoes">
        <button
          type="button"
          className="botao-pequeno"
          onClick={async () => {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1800);
          }}
        >
          {copiado ? "Copiada" : "Copiar ficha"}
        </button>
        <a className="botao-pequeno botao-pequeno-apagado" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
          Abrir no WhatsApp
        </a>
      </div>
    </details>
  );
}

function FormImovel(o: Opcoes & { salvo: () => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(o.salvar, o.salvo, o.inicial);
  const [finalidade, setFinalidade] = useState(v.finalidade ?? "venda");
  return (
    <form key={versao} action={enviar} className="form-lancar">
      {o.edicao && <h3 className="largo">Dados do imóvel</h3>}
      <Campo rotulo="Título do anúncio" erro={erros.titulo} largo>
        <input name="titulo" defaultValue={v.titulo} maxLength={120} required autoFocus={!v.titulo} placeholder="Ex.: Apartamento 3 quartos com vista mar" />
      </Campo>
      <Campo rotulo="Código" erro={erros.codigo}>
        <input name="codigo" defaultValue={v.codigo} maxLength={20} required style={{ textTransform: "uppercase" }} />
      </Campo>
      <Campo rotulo="Tipo" erro={erros.tipo}>
        <select name="tipo" defaultValue={v.tipo ?? "apartamento"}>
          {TIPOS_IMOVEL.map((t) => (
            <option key={t} value={t}>
              {NOME_TIPO[t]}
            </option>
          ))}
        </select>
      </Campo>
      <div className="campo-form largo">
        <span>Para</span>
        <div className="alternar" role="radiogroup" aria-label="Finalidade">
          {[
            ["venda", "Venda"],
            ["aluguel", "Aluguel"],
            ["venda_aluguel", "Venda e aluguel"],
          ].map(([id, nome]) => (
            <button key={id} type="button" role="radio" aria-checked={finalidade === id} aria-pressed={finalidade === id} onClick={() => setFinalidade(id)}>
              {nome}
            </button>
          ))}
        </div>
        <input type="hidden" name="finalidade" value={finalidade} />
      </div>
      {finalidade !== "aluguel" && (
        <Campo rotulo="Preço de venda (R$)" erro={erros.precoVenda}>
          <input name="precoVenda" inputMode="decimal" placeholder="450.000,00" defaultValue={v.precoVenda} />
        </Campo>
      )}
      {finalidade !== "venda" && (
        <Campo rotulo="Aluguel por mês (R$)" erro={erros.aluguel}>
          <input name="aluguel" inputMode="decimal" placeholder="2.500,00" defaultValue={v.aluguel} />
        </Campo>
      )}
      <Campo rotulo="Condomínio (R$)" erro={erros.condominio}>
        <input name="condominio" inputMode="decimal" placeholder="0,00" defaultValue={v.condominio} />
      </Campo>
      <Campo rotulo="IPTU por ano (R$)" erro={erros.iptu}>
        <input name="iptu" inputMode="decimal" placeholder="0,00" defaultValue={v.iptu} />
      </Campo>
      <Campo rotulo="Bairro" erro={erros.bairro}>
        <input name="bairro" defaultValue={v.bairro} maxLength={80} />
      </Campo>
      <Campo rotulo="Cidade" erro={erros.cidade}>
        <input name="cidade" defaultValue={v.cidade} maxLength={80} />
      </Campo>
      <Campo rotulo="Endereço (fica só aqui dentro)" erro={erros.endereco} largo>
        <input name="endereco" defaultValue={v.endereco} maxLength={200} placeholder="Rua, número, complemento" />
      </Campo>
      <div className="imovel-numeros largo">
        <Campo rotulo="Área (m²)" erro={erros.areaM2}>
          <input name="areaM2" inputMode="numeric" defaultValue={v.areaM2} />
        </Campo>
        <Campo rotulo="Quartos" erro={erros.quartos}>
          <input name="quartos" inputMode="numeric" defaultValue={v.quartos} />
        </Campo>
        <Campo rotulo="Suítes" erro={erros.suites}>
          <input name="suites" inputMode="numeric" defaultValue={v.suites} />
        </Campo>
        <Campo rotulo="Banheiros" erro={erros.banheiros}>
          <input name="banheiros" inputMode="numeric" defaultValue={v.banheiros} />
        </Campo>
        <Campo rotulo="Vagas" erro={erros.vagas}>
          <input name="vagas" inputMode="numeric" defaultValue={v.vagas} />
        </Campo>
      </div>
      <Campo rotulo="Diferenciais (separe por vírgula)" erro={erros.destaques} largo>
        <input name="destaques" defaultValue={v.destaques} maxLength={600} placeholder="Vista mar, varanda gourmet, aceita pet, piscina" />
      </Campo>
      <Campo rotulo="Proprietário" erro={erros.proprietarioId}>
        <select name="proprietarioId" defaultValue={v.proprietarioId ?? ""}>
          <option value="">Sem proprietário cadastrado</option>
          {o.proprietarios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Corretor responsável" erro={erros.corretor}>
        <input name="corretor" defaultValue={v.corretor} maxLength={80} />
      </Campo>
      <Campo rotulo="Comissão (%)" erro={erros.comissao}>
        <input name="comissao" inputMode="decimal" defaultValue={v.comissao ?? "6"} />
      </Campo>
      <Campo rotulo="Captado em" erro={erros.captadoEm}>
        <input name="captadoEm" type="date" defaultValue={v.captadoEm ?? o.hoje} max={o.hoje} />
      </Campo>
      <label className="campo-check largo">
        <input type="checkbox" name="exclusivo" defaultChecked={v.exclusivo === "on"} /> Exclusividade com a imobiliária
      </label>
      <Campo rotulo="Fotos (links, um por linha)" erro={erros.fotos} largo>
        <textarea name="fotos" rows={2} defaultValue={v.fotos} placeholder="https://… (a primeira vira a capa)" />
      </Campo>
      <label className="campo-form largo">
        <span>Descrição do anúncio</span>
        <textarea name="descricao" rows={3} maxLength={3000} defaultValue={v.descricao} />
      </label>
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : o.edicao ? "Salvar alterações" : "Colocar na carteira"}
      </button>
    </form>
  );
}

function Excluir({ excluir, fechar }: { excluir: () => Promise<{ erro?: string }>; fechar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <footer className="janela-pe">
      {confirmar ? (
        <>
          <span>Tirar este imóvel da carteira? Negócios e contratos ligados a ele continuam.</span>
          <button type="button" className="botao-claro" onClick={() => setConfirmar(false)}>
            Não
          </button>
          <button
            type="button"
            className="botao-perigo"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                await excluir();
                fechar();
              })
            }
          >
            Sim, tirar
          </button>
        </>
      ) : (
        <button type="button" className="botao-texto-perigo" onClick={() => setConfirmar(true)}>
          Tirar da carteira
        </button>
      )}
    </footer>
  );
}
