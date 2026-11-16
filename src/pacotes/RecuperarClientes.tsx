"use client";

import { MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icone } from "@/componentes/Icone";
import { enviadoAcao, naoContatarAcao, resultadoAcao } from "./recuperacao-acoes";

export interface ParaChamar {
  clienteId: string;
  nome: string;
  telefone: string;
  motivo: "ritmo" | "sumiu";
  porque: string;
  compras: number;
  gastoCentavos: number;
  ultimaCompra: string;
  mensagem: string;
}

export interface Aguardando {
  id: string;
  clienteId: string;
  nome: string;
  telefone: string | null;
  porque: string;
  dia: string;
  vendasParaLigar: { id: string; data: string; valor: number; descricao: string }[];
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: c % 100 ? 2 : 0 });
const diaCurto = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const wa = (telefone: string, texto: string) => `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;

/** Um cliente na lista: mensagem editável, abrir o WhatsApp, confirmar que mandou. */
function Cartao({ empresaId, c, semWhatsapp }: { empresaId: string; c: ParaChamar; semWhatsapp: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(c.mensagem);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ erro?: string }>) =>
    iniciar(async () => {
      const r = await f();
      if (r.erro) return setErro(r.erro);
      router.refresh();
    });
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="rec-cartao">
      <header>
        <span className="rec-quem">
          <strong>{c.nome}</strong>
          <small>
            {c.compras} {c.compras === 1 ? "compra" : "compras"} · {reais(c.gastoCentavos)} no total · última em {diaCurto(c.ultimaCompra)}
          </small>
        </span>
        <span className={`pilula rec-motivo-${c.motivo}`}>{c.motivo === "ritmo" ? "Parou de vir" : "Não voltou"}</span>
      </header>
      <p className="rec-porque">{c.porque}</p>
      <label className="rec-mensagem">
        <span>Mensagem (revise antes de mandar)</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={2000} />
      </label>
      <div className="rec-acoes">
        {aberto ? (
          <>
            <button type="button" className="botao-pequeno" disabled={pendente} onClick={() => rodar(() => enviadoAcao(empresaId, { clienteId: c.clienteId, motivo: c.motivo, porque: c.porque, mensagem: texto }))}>
              <Icone nome="check" /> Enviei
            </button>
            {!semWhatsapp && (
              <a className="botao-pequeno botao-pequeno-apagado" href={wa(c.telefone, texto)} target="_blank" rel="noreferrer">
                Abrir de novo
              </a>
            )}
          </>
        ) : semWhatsapp ? (
          <button type="button" className="botao-pequeno" onClick={() => setAberto(true)} title="Na demonstração o WhatsApp não abre">
            <Icone nome="whatsapp" /> Simular envio
          </button>
        ) : (
          <a className="botao-pequeno" href={wa(c.telefone, texto)} target="_blank" rel="noreferrer" onClick={() => setAberto(true)} aria-label={`Abrir o WhatsApp para falar com ${c.nome}`}>
            <Icone nome="whatsapp" /> Abrir WhatsApp
          </a>
        )}
        <button type="button" className="botao-texto-perigo" disabled={pendente} onClick={() => window.confirm(`${c.nome} não vai mais aparecer em nenhuma lista de contato. Confirmar?`) && rodar(() => naoContatarAcao(empresaId, c.clienteId))}>
          Pediu para não receber
        </button>
      </div>
      {erro && (
        <p role="alert" className="erro-pequeno">
          {erro}
        </p>
      )}
    </motion.li>
  );
}

/** Contato feito, esperando o que deu. "Comprou" pede a venda: só conta o que alguém ligou de propósito. */
function Esperando({ empresaId, c }: { empresaId: string; c: Aguardando }) {
  const router = useRouter();
  const [escolhendo, setEscolhendo] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const marcar = (res: string, vendaId?: string) =>
    iniciar(async () => {
      const r = await resultadoAcao(empresaId, c.id, res, vendaId);
      if (r.erro) return setErro(r.erro);
      router.refresh();
    });
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rec-espera">
      <span className="rec-quem">
        <strong>{c.nome}</strong>
        <small>
          Chamado em {diaCurto(c.dia)} · {c.porque}
        </small>
      </span>
      {escolhendo ? (
        <div className="rec-vendas">
          {c.vendasParaLigar.length ? (
            <>
              <span>Qual venda veio deste contato?</span>
              {c.vendasParaLigar.map((v) => (
                <button key={v.id} type="button" className="botao-pequeno botao-pequeno-apagado" disabled={pendente} onClick={() => marcar("comprou", v.id)}>
                  {diaCurto(v.data)} · {reais(v.valor)}
                  {v.descricao ? ` · ${v.descricao.slice(0, 30)}` : ""}
                </button>
              ))}
            </>
          ) : (
            <span>Lance a venda com {c.nome.split(" ")[0]} como cliente e volte aqui para ligar ao contato.</span>
          )}
          <button type="button" className="link" onClick={() => setEscolhendo(false)}>
            Voltar
          </button>
        </div>
      ) : (
        <div className="rec-resultados" role="group" aria-label={`Resultado do contato com ${c.nome}`}>
          <button type="button" className="botao-pequeno botao-pequeno-apagado" disabled={pendente} onClick={() => marcar("respondeu")}>
            Respondeu
          </button>
          <button type="button" className="botao-pequeno botao-pequeno-apagado" disabled={pendente} onClick={() => marcar("agendou")}>
            Agendou
          </button>
          <button type="button" className="botao-pequeno" disabled={pendente} onClick={() => setEscolhendo(true)}>
            Comprou
          </button>
          <button type="button" className="botao-pequeno botao-pequeno-apagado" disabled={pendente} onClick={() => marcar("sem_interesse")}>
            Sem interesse
          </button>
        </div>
      )}
      {erro && (
        <p role="alert" className="erro-pequeno">
          {erro}
        </p>
      )}
    </motion.li>
  );
}

export function RecuperarClientes({ empresaId, lista, aguardando, semWhatsapp }: { empresaId: string; lista: ParaChamar[]; aguardando: Aguardando[]; semWhatsapp: boolean }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="rec-grade">
        <section className="cartao" aria-labelledby="rec-chamar">
          <header className="cartao-topo">
            <h2 id="rec-chamar">Para chamar agora</h2>
            <span className="nota">{lista.length ? `${lista.length} ${lista.length === 1 ? "pessoa" : "pessoas"}` : ""}</span>
          </header>
          {lista.length ? (
            <ul className="rec-lista">
                              {lista.map((c) => (
                  <Cartao key={c.clienteId} empresaId={empresaId} c={c} semWhatsapp={semWhatsapp} />
                ))}
                          </ul>
          ) : (
            <p className="vazio">Ninguém para chamar agora. Quem passar do ritmo de compra aparece aqui.</p>
          )}
        </section>
        <section className="cartao" aria-labelledby="rec-espera">
          <header className="cartao-topo">
            <h2 id="rec-espera">Aguardando resposta</h2>
          </header>
          {aguardando.length ? (
            <ul className="rec-lista">
                              {aguardando.map((c) => (
                  <Esperando key={c.id} empresaId={empresaId} c={c} />
                ))}
                          </ul>
          ) : (
            <p className="vazio">Depois de mandar, marque aqui o que a pessoa respondeu.</p>
          )}
        </section>
      </div>
    </MotionConfig>
  );
}
