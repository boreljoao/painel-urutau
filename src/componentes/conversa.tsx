"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useTransition } from "react";
import type { EstadoForm } from "@/lib/estado-form";
import { Icone } from "./Icone";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

/** A caixa de escrever, no pé da conversa. Limpa sozinha depois de enviar. */
export function Responder({ acao, aviso }: { acao: AcaoForm; aviso: string }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!estado.ok) return;
    form.current?.reset();
    router.refresh();
  }, [estado, router]);
  const erro = estado.erros?.texto ?? estado.erros?._;
  return (
    <form ref={form} action={enviar} className="responder-bloco">
      <div className="responder">
        <label className="oculto" htmlFor="texto">
          Mensagem
        </label>
        <input id="texto" name="texto" defaultValue={estado.valores?.texto} placeholder="Escreva como equipe da loja" autoComplete="off" maxLength={4000} />
        <button aria-label="Enviar" disabled={pendente}>
          <Icone nome="enviar" />
        </button>
      </div>
      <p className={erro ? "erro-pequeno" : "nota"} role={erro ? "alert" : undefined}>
        {pendente ? "Enviando…" : (erro ?? aviso)}
      </p>
    </form>
  );
}

/** Modo aprovação: o que o atendente escreveu espera alguém revisar, editar e mandar. */
export function Rascunho({ texto, aprovar, descartar }: { texto: string; aprovar: AcaoForm; descartar: () => Promise<void> }) {
  const [estado, enviar, enviando] = useActionState(aprovar, {});
  const [descartando, iniciar] = useTransition();
  const router = useRouter();
  const pendente = enviando || descartando;
  useEffect(() => {
    if (estado.ok) router.refresh();
  }, [estado, router]);
  return (
    <form action={enviar} className="rascunho">
      <p className="rascunho-titulo">O atendente sugeriu esta resposta</p>
      <textarea name="texto" defaultValue={estado.valores?.texto ?? texto} rows={3} aria-label="Resposta sugerida" />
      {estado.erros?._ && (
        <p className="erro-pequeno" role="alert">
          {estado.erros._}
        </p>
      )}
      <div className="rascunho-botoes">
        <button className="botao" disabled={pendente}>
          <Icone nome="check" />
          {enviando ? "Enviando…" : "Aprovar e enviar"}
        </button>
        <button type="button" className="botao-claro" disabled={pendente} onClick={() => iniciar(async () => (await descartar(), router.refresh()))}>
          Descartar
        </button>
      </div>
    </form>
  );
}

/** Mantém a conversa rolada até a última mensagem quando chega uma nova. */
export function RolarParaFim({ marca }: { marca: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const lista = ref.current?.previousElementSibling;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [marca]);
  return <span ref={ref} hidden />;
}
