"use client";

/**
 * Um interessado no funil: dados, etapa, fechar (lança a comissão) ou perder (com o motivo).
 * Guiada pelo endereço (?novo=1 ou ?editar=<id>).
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { EtapaNegocio } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { MOTIVOS_PERDA, NOME_ETAPA, ORIGENS_LEAD } from "@/lib/imobiliaria";
import { Icone } from "@/componentes/Icone";
import { Campo2 as Campo, useSalvar } from "@/componentes/lancar";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

interface Edicao {
  etapa: EtapaNegocio;
  mover: (etapa: string, motivo?: string) => Promise<{ erro?: string }>;
  fechar: AcaoForm;
  comissaoPadrao: string;
  whatsapp: string | null;
  /** Link para o simulador de financiamento já preenchido (só negócio de compra). */
  simular?: string | null;
}

interface Opcoes {
  titulo: string;
  salvar: AcaoForm;
  inicial: Record<string, string>;
  hoje: string;
  fechar: string;
  clientes: { id: string; nome: string }[];
  imoveis: { id: string; rotulo: string }[];
  edicao?: Edicao;
}

const lerCampo = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function JanelaNegocio(o: Opcoes) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const j = janela.current;
    if (j && !j.open) {
      j.showModal();
      j.scrollTop = 0;
    }
  }, []);
  const aberto = o.edicao && o.edicao.etapa !== "fechado" && o.edicao.etapa !== "perdido";
  return (
    <dialog ref={janela} className="janela janela-agenda" aria-labelledby="negocio-titulo" onClose={() => router.replace(o.fechar, { scroll: false })} onClick={(e) => e.target === janela.current && janela.current.close()}>
      <header className="janela-topo">
        <h2 id="negocio-titulo">{o.titulo}</h2>
        {o.edicao && <span className={`pilula etapa-${o.edicao.etapa}`}>{NOME_ETAPA[o.edicao.etapa]}</span>}
        <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
          ×
        </button>
      </header>
      {o.edicao?.whatsapp && (
        <div className="agenda-receber">
          <a className="botao-pequeno" href={o.edicao.whatsapp} target="_blank" rel="noreferrer">
            <Icone nome="whatsapp" /> Conversar no WhatsApp
          </a>
        </div>
      )}
      {o.edicao?.simular && (
        <p className="largo">
          <a className="botao-pequeno botao-pequeno-apagado" href={o.edicao.simular}>
            <Icone nome="banco" /> Simular financiamento
          </a>
        </p>
      )}
      {aberto && o.edicao && <Etapas e={o.edicao} />}
      {aberto && o.edicao && <Fechar e={o.edicao} valor={o.inicial.valor} hoje={o.hoje} />}
      <FormNegocio {...o} salvo={() => janela.current?.close()} />
      {aberto && o.edicao && <Perder e={o.edicao} fechar={() => janela.current?.close()} />}
    </dialog>
  );
}

function Etapas({ e }: { e: Edicao }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const etapas: EtapaNegocio[] = ["lead", "atendimento", "visita", "proposta"];
  return (
    <div className="agenda-situacao">
      <div className="alternar" role="group" aria-label="Etapa do negócio">
        {etapas.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={e.etapa === s}
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await e.mover(s);
                if (r.erro) return setErro(r.erro);
                router.refresh();
              })
            }
          >
            {NOME_ETAPA[s]}
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

/** Fechou: mostra a comissão antes de lançar. */
function Fechar({ e, valor, hoje }: { e: Edicao; valor?: string; hoje: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [v1, setV1] = useState(valor ?? "");
  const [pct, setPct] = useState(e.comissaoPadrao);
  const { erros, v, enviar, pendente, versao } = useSalvar(e.fechar, () => router.refresh(), { valor: valor ?? "", comissao: e.comissaoPadrao, data: hoje });
  const centavos = lerCampo(v1);
  const p = Number(pct.replace(",", "."));
  const comissao = centavos != null && Number.isFinite(p) ? Math.round((centavos * p) / 100) : null;
  if (!aberto)
    return (
      <div className="agenda-receber">
        <button type="button" className="botao" onClick={() => setAberto(true)}>
          <Icone nome="check" /> Fechar negócio
        </button>
        <span className="nota">A comissão entra nas receitas e o imóvel sai da carteira.</span>
      </div>
    );
  return (
    <form key={versao} action={enviar} className="form-lancar agenda-receber-form">
      <h3 className="largo">Fechar negócio</h3>
      <Campo rotulo="Valor fechado (R$)" erro={erros.valor}>
        <input name="valor" inputMode="decimal" defaultValue={v.valor} onChange={(x) => setV1(x.target.value)} required autoFocus />
      </Campo>
      <Campo rotulo="Comissão (%)" erro={erros.comissao}>
        <input name="comissao" inputMode="decimal" defaultValue={v.comissao} onChange={(x) => setPct(x.target.value)} />
      </Campo>
      <Campo rotulo="Dia" erro={erros.data}>
        <input name="data" type="date" defaultValue={v.data} max={hoje} />
      </Campo>
      <label className="campo-check">
        <input type="checkbox" name="recebido" /> Comissão já recebida
      </label>
      {comissao != null && comissao > 0 && (
        <p className="negocio-comissao largo">
          Comissão da imobiliária: <b>{reais(comissao)}</b>
        </p>
      )}
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Fechando…" : "Confirmar fechamento"}
      </button>
    </form>
  );
}

function Perder({ e, fechar }: { e: Edicao; fechar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS_PERDA[0]);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <footer className="janela-pe">
      {aberto ? (
        <>
          <select value={motivo} onChange={(x) => setMotivo(x.target.value)} aria-label="Motivo da perda">
            {MOTIVOS_PERDA.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button type="button" className="botao-claro" onClick={() => setAberto(false)}>
            Voltar
          </button>
          <button
            type="button"
            className="botao-perigo"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await e.mover("perdido", motivo);
                if (r.erro) return setErro(r.erro);
                fechar();
              })
            }
          >
            Marcar como perdido
          </button>
          {erro && <span className="erro-pequeno">{erro}</span>}
        </>
      ) : (
        <button type="button" className="botao-texto-perigo" onClick={() => setAberto(true)}>
          Perdemos este negócio
        </button>
      )}
    </footer>
  );
}

function FormNegocio(o: Opcoes & { salvo: () => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(o.salvar, o.salvo, o.inicial);
  const [tipo, setTipo] = useState(v.tipo ?? "compra");
  return (
    <form key={versao} action={enviar} className="form-lancar">
      {o.edicao && <h3 className="largo">Dados do negócio</h3>}
      <Campo rotulo="Cliente" erro={erros.clienteId} largo>
        <select name="clienteId" defaultValue={v.clienteId ?? ""} required>
          <option value="">Escolha o cliente</option>
          {o.clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      <div className="campo-form largo">
        <span>Quer</span>
        <div className="alternar" role="radiogroup" aria-label="Tipo de negócio">
          {[
            ["compra", "Comprar"],
            ["locacao", "Alugar"],
          ].map(([id, nome]) => (
            <button key={id} type="button" role="radio" aria-checked={tipo === id} aria-pressed={tipo === id} onClick={() => setTipo(id)}>
              {nome}
            </button>
          ))}
        </div>
        <input type="hidden" name="tipo" value={tipo} />
      </div>
      <Campo rotulo="Imóvel de interesse" erro={erros.imovelId} largo>
        <select name="imovelId" defaultValue={v.imovelId ?? ""}>
          <option value="">Ainda procurando</option>
          {o.imoveis.map((i) => (
            <option key={i.id} value={i.id}>
              {i.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo={tipo === "locacao" ? "Aluguel em vista (R$)" : "Valor em vista (R$)"} erro={erros.valor}>
        <input name="valor" inputMode="decimal" defaultValue={v.valor} placeholder="0,00" />
      </Campo>
      <Campo rotulo="Como chegou" erro={erros.origem}>
        <select name="origem" defaultValue={v.origem ?? ""}>
          <option value="">Não sei</option>
          {ORIGENS_LEAD.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Corretor" erro={erros.corretor}>
        <input name="corretor" defaultValue={v.corretor} maxLength={80} />
      </Campo>
      <Campo rotulo="O que procura" erro={erros.procura} largo>
        <input name="procura" defaultValue={v.procura} maxLength={600} placeholder="Ex.: 3 quartos perto da praia, até R$ 600 mil, aceita financiamento" />
      </Campo>
      <Campo rotulo="Próximo passo" erro={erros.proximoPasso}>
        <input name="proximoPasso" defaultValue={v.proximoPasso} maxLength={200} placeholder="Ex.: mandar 3 opções" />
      </Campo>
      <Campo rotulo="Quando" erro={erros.proximoEm}>
        <input name="proximoEm" type="date" defaultValue={v.proximoEm} />
      </Campo>
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : o.edicao ? "Salvar alterações" : "Colocar no funil"}
      </button>
    </form>
  );
}
