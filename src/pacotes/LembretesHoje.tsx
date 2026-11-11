"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { Icone } from "@/componentes/Icone";
import { marcarLembreteEnviado } from "./agenda-acoes";

export interface ItemLembrete {
  id: string;
  nome: string;
  quando: string;
  tipo: "marcado" | "h48" | "h2";
  tipoNome: string;
  whatsapp: string;
}

/**
 * Os lembretes que venceram, prontos para mandar: um toque abre o WhatsApp com a mensagem e o link
 * de confirmação. Abrir não é enviar (auditoria F15): ao voltar, a pessoa diz "Enviei" e só então
 * o lembrete conta como mandado. Funciona com qualquer WhatsApp, sem a API da Meta.
 */
export function LembretesHoje({ empresaId, itens, automatico }: { empresaId: string; itens: ItemLembrete[]; automatico: boolean }) {
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const confirmar = (i: ItemLembrete) => {
    const k = `${i.id}:${i.tipo}`;
    setEnviados((s) => new Set(s).add(k));
    iniciar(async () => {
      const r = await marcarLembreteEnviado(empresaId, i.id, i.tipo);
      if (r?.erro) {
        setErro(r.erro);
        setEnviados((s) => {
          const n = new Set(s);
          n.delete(k);
          return n;
        });
      }
    });
  };
  const lista = itens.filter((i) => !enviados.has(`${i.id}:${i.tipo}`));
  return (
    <section className="cartao agenda2-lembretes">
      <h2>Mandar hoje</h2>
      {automatico && <p className="nota">O WhatsApp oficial manda sozinho; estes ficaram de fora (sem número ou recusados).</p>}
      {lista.length ? (
        <ul>
          <AnimatePresence initial={false}>
            {lista.map((i) => (
              <motion.li key={`${i.id}:${i.tipo}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, height: 0, marginTop: 0 }} transition={{ duration: 0.22 }}>
                <span>
                  <strong>{i.nome}</strong>
                  <small>
                    {i.quando} · {i.tipoNome}
                  </small>
                </span>
                {abertos.has(`${i.id}:${i.tipo}`) ? (
                  <span className="lembrete-confirmar">
                    <button type="button" className="botao-pequeno" onClick={() => confirmar(i)}>
                      Enviei
                    </button>
                    <a className="botao-pequeno botao-pequeno-apagado" href={i.whatsapp} target="_blank" rel="noreferrer">
                      Abrir de novo
                    </a>
                  </span>
                ) : (
                  <a
                    className="botao-pequeno"
                    href={i.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir o WhatsApp para lembrar ${i.nome}`}
                    onClick={() => setAbertos((s) => new Set(s).add(`${i.id}:${i.tipo}`))}
                  >
                    <Icone nome="whatsapp" /> Abrir WhatsApp
                  </a>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="vazio">Nenhum lembrete para mandar agora.</p>
      )}
      {erro && (
        <p role="alert" className="erro-pequeno">
          {erro}
        </p>
      )}
    </section>
  );
}
