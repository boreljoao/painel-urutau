"use client";

/**
 * Marcar e editar um horário. Como as outras janelas do painel, é guiada pelo endereço
 * (?novo=HH:MM ou ?editar=<id>): a página só carrega clientes e sugestões quando ela abre.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { StatusAgendamento } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";
import { Icone } from "@/componentes/Icone";
import { Campo2 as Campo, useSalvar } from "@/componentes/lancar";
import { NOME_STATUS } from "./agenda";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;
type AcaoSimples = () => Promise<{ erro?: string } | void>;

interface Edicao {
  status: StatusAgendamento;
  recebido: boolean;
  /** Link do WhatsApp com a mensagem de confirmação pronta (só quando há telefone). */
  whatsapp?: string;
  mudar: Partial<Record<StatusAgendamento, AcaoSimples>>;
  excluir: () => Promise<{ erro?: string }>;
  receber: AcaoForm;
  fontes: { id: string; nome: string }[];
  aposExcluir: string;
}

interface Opcoes {
  titulo: string;
  pessoa: string;
  salvar: AcaoForm;
  inicial: Record<string, string>;
  clientes: { id: string; nome: string; telefone: string | null }[];
  servicos: string[];
  profissionais: string[];
  salas: string[];
  hoje: string;
  fechar: string;
  /** Para onde ir depois de salvar; recebe o dia do horário. */
  aposSalvar: string;
  edicao?: Edicao;
  /** Nome do campo do serviço no ramo: Procedimento, Tipo de sessão… */
  rotuloServico?: string;
}

const formatarTel = (t: string | null) => {
  const m = t && /^55(\d{2})(\d{4,5})(\d{4})$/.exec(t);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (t ?? "");
};

export function JanelaAgendamento(o: Opcoes) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const j = janela.current;
    if (j && !j.open) {
      j.showModal();
      // O navegador rola até o primeiro campo focável; a janela começa do topo, com o nome e a situação.
      j.scrollTop = 0;
    }
  }, []);

  const irPara = (url: string) => router.replace(url, { scroll: false });
  const salvo = (_: string, v?: Record<string, string>) => {
    const url = new URL(o.aposSalvar, location.origin);
    if (v?.data) url.searchParams.set("dia", v.data);
    irPara(url.pathname + url.search);
  };

  return (
    <dialog ref={janela} className="janela janela-agenda" aria-labelledby="agenda-titulo" onClose={() => irPara(o.fechar)} onClick={(e) => e.target === janela.current && janela.current.close()}>
      <header className="janela-topo">
        <h2 id="agenda-titulo">{o.titulo}</h2>
        {o.edicao && <span className={`pilula situacao-${o.edicao.status}`}>{NOME_STATUS[o.edicao.status]}</span>}
        <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
          ×
        </button>
      </header>
      {o.edicao && <Situacao e={o.edicao} />}
      <FormAgendamento {...o} salvo={salvo} />
      {o.edicao && !o.edicao.recebido && <Receber e={o.edicao} valor={o.inicial.valor} />}
      {o.edicao && <Excluir e={o.edicao} irPara={irPara} />}
    </dialog>
  );
}

function FormAgendamento(o: Opcoes & { salvo: (t: string, v?: Record<string, string>) => void }) {
  const { erros, v, enviar, pendente, versao } = useSalvar(o.salvar, o.salvo, o.inicial);
  const [clienteId, setClienteId] = useState(v.clienteId ?? "");
  const [telefone, setTelefone] = useState(v.telefone ?? "");
  // Bloquear: o horário fica ocupado na grade, sem ninguém marcado (almoço, folga, reunião).
  const [bloquear, setBloquear] = useState(v.bloquear === "1");
  // Escolher um nome da lista liga o horário ao cliente e traz o telefone dele.
  const escolher = (nome: string) => {
    const c = o.clientes.find((x) => x.nome.toLowerCase() === nome.trim().toLowerCase());
    setClienteId(c?.id ?? "");
    if (c?.telefone) setTelefone(formatarTel(c.telefone));
  };
  return (
    <form key={versao} action={enviar} className="form-lancar">
      <input type="hidden" name="clienteId" value={clienteId} />
      {v.forcar && <input type="hidden" name="forcar" value="1" />}
      {!o.edicao && (
        <label className="campo-check largo">
          <input type="checkbox" name="bloquear" value="1" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
          <span>Bloquear este horário (sem atendimento)</span>
        </label>
      )}
      <Campo rotulo={bloquear ? "Motivo (opcional)" : o.pessoa} erro={erros.nome} largo>
        <input name="nome" list="agenda-clientes" defaultValue={v.nome} maxLength={120} autoComplete="off" required={!bloquear} autoFocus={!v.nome} onChange={(e) => escolher(e.target.value)} placeholder={bloquear ? "Ex.: almoço, reunião" : "Comece a digitar o nome"} />
        <datalist id="agenda-clientes">
          {o.clientes.map((c) => (
            <option key={c.id} value={c.nome} />
          ))}
        </datalist>
      </Campo>
      <Campo rotulo="Dia" erro={erros.data}>
        <input name="data" type="date" defaultValue={v.data ?? o.hoje} required />
      </Campo>
      <Campo rotulo="Hora" erro={erros.hora}>
        <input name="hora" type="time" step={300} defaultValue={v.hora} required />
      </Campo>
      <Campo rotulo="Duração (min)" erro={erros.duracao}>
        <input name="duracao" type="number" inputMode="numeric" min={5} max={720} step={5} defaultValue={v.duracao} required />
      </Campo>
      <Campo rotulo="WhatsApp (opcional)" erro={erros.telefone}>
        <input name="telefone" type="tel" inputMode="tel" placeholder="(21) 99999-8888" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      </Campo>
      <Campo rotulo={o.rotuloServico ?? "O que vai ser"} erro={erros.servico} largo>
        <input name="servico" list="agenda-servicos" defaultValue={v.servico} maxLength={120} autoComplete="off" />
        <datalist id="agenda-servicos">
          {o.servicos.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Campo>
      <Campo rotulo="Quem atende" erro={erros.profissional}>
        <input name="profissional" list="agenda-profissionais" defaultValue={v.profissional} maxLength={80} autoComplete="off" />
        <datalist id="agenda-profissionais">
          {o.profissionais.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Campo>
      <Campo rotulo="Sala ou local" erro={erros.sala}>
        <input name="sala" list="agenda-salas" defaultValue={v.sala} maxLength={60} autoComplete="off" />
        <datalist id="agenda-salas">
          {o.salas.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Campo>
      {!bloquear && (
        <label className="campo-check largo">
          <input type="checkbox" name="online" value="1" defaultChecked={v.online === "1"} />
          <span>Sessão online (vídeo ou telefone)</span>
        </label>
      )}
      {!o.edicao && !bloquear && (
        <label className="campo-form largo">
          <span>Repetir</span>
          <select name="repetir" defaultValue={v.repetir ?? "1"}>
            <option value="1">Só desta vez</option>
            <option value="4">Toda semana, por 4 semanas</option>
            <option value="8">Toda semana, por 8 semanas</option>
            <option value="12">Toda semana, por 12 semanas</option>
            <option value="24">Toda semana, por 24 semanas</option>
          </select>
        </label>
      )}
      <Campo rotulo="Valor (R$, opcional)" erro={erros.valor}>
        <input name="valor" inputMode="decimal" placeholder="0,00" defaultValue={v.valor} />
      </Campo>
      <label className="campo-form largo">
        <span>Anotações</span>
        <textarea name="observacao" rows={2} maxLength={1000} defaultValue={v.observacao} />
        {erros.observacao && <em role="alert">{erros.observacao}</em>}
      </label>
      {erros._ && (
        <p className={`largo ${v.forcar ? "aviso-choque" : "erro-pequeno"}`} role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Salvando…" : v.forcar ? "Marcar mesmo assim" : o.edicao ? "Salvar alterações" : "Marcar horário"}
      </button>
    </form>
  );
}

/** Os botões de situação: confirmar (com a mensagem pronta no WhatsApp), atendido, faltou, cancelar. */
function Situacao({ e }: { e: Edicao }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const mudar = (s: StatusAgendamento) =>
    iniciar(async () => {
      const r = await e.mudar[s]?.();
      if (r?.erro) return setErro(r.erro);
      router.refresh();
    });
  const botoes: { s: StatusAgendamento; rotulo: string }[] = [
    { s: "confirmado", rotulo: "Confirmado" },
    { s: "atendido", rotulo: "Atendido" },
    { s: "faltou", rotulo: "Faltou" },
    { s: "cancelado", rotulo: "Cancelar" },
  ];
  return (
    <div className="agenda-situacao">
      {e.whatsapp && (e.status === "marcado" || e.status === "confirmado") && (
        <a className="botao-claro" href={e.whatsapp} target="_blank" rel="noreferrer">
          <Icone nome="whatsapp" /> Confirmar pelo WhatsApp
        </a>
      )}
      <div className="alternar" role="group" aria-label="Situação do horário">
        {botoes.map((b) => (
          <button key={b.s} type="button" aria-pressed={e.status === b.s} disabled={pendente || e.recebido} onClick={() => mudar(e.status === b.s ? "marcado" : b.s)}>
            {b.rotulo}
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

/** Lançar o recebimento: vira venda (com o cliente) e o horário fica como atendido. */
function Receber({ e, valor }: { e: Edicao; valor?: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const { erros, v, enviar, pendente, versao } = useSalvar(e.receber, () => router.refresh(), { valor: valor ?? "", status: "recebido" });
  if (!aberto)
    return (
      <div className="agenda-receber">
        <button type="button" className="botao-claro" onClick={() => setAberto(true)}>
          <Icone nome="vendas" /> Lançar recebimento
        </button>
        <span className="nota">Vai para as vendas, o caixa e o imposto.</span>
      </div>
    );
  return (
    <form key={versao} action={enviar} className="form-lancar agenda-receber-form">
      <h3 className="largo">Lançar recebimento</h3>
      <Campo rotulo="Valor (R$)" erro={erros.valor}>
        <input name="valor" inputMode="decimal" placeholder="0,00" defaultValue={v.valor} required autoFocus />
      </Campo>
      <Campo rotulo="Como pagou" erro={erros.formaPagamento}>
        <select name="formaPagamento" defaultValue={v.formaPagamento ?? "pix"}>
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
      {erros._ && (
        <p className="erro-pequeno largo" role="alert">
          {erros._}
        </p>
      )}
      <button className="botao largo" disabled={pendente}>
        {pendente ? "Lançando…" : "Lançar recebimento"}
      </button>
    </form>
  );
}

function Excluir({ e, irPara }: { e: Edicao; irPara: (url: string) => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <footer className="janela-pe">
      {confirmar ? (
        <>
          <span>Apagar este horário da agenda? Dá para desfazer logo em seguida.</span>
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
                irPara(e.aposExcluir);
              })
            }
          >
            {pendente ? "Apagando…" : "Sim, apagar"}
          </button>
        </>
      ) : (
        <button type="button" className="botao-texto-perigo" onClick={() => setConfirmar(true)}>
          Apagar horário
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
