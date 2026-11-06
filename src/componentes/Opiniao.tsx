"use client";

import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import type { EstadoForm } from "@/lib/estado-form";

/** "Dar opinião": uma janela curta, em qualquer tela. O texto chega na equipe Urutau. */
export function Opiniao({ enviar, visitante }: { enviar: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>; visitante: boolean }) {
  const janela = useRef<HTMLDialogElement>(null);
  const [chave, setChave] = useState(0);
  const abrir = () => {
    setChave((k) => k + 1);
    janela.current?.showModal();
  };
  return (
    <>
      <button type="button" className="botao-opiniao" onClick={abrir}>
        Dar opinião
      </button>
      <dialog ref={janela} className="janela" aria-labelledby="opiniao-titulo" onClick={(e) => e.target === janela.current && janela.current.close()}>
        <header className="janela-topo">
          <h2 id="opiniao-titulo">O que podia ser melhor?</h2>
          <button type="button" className="fechar" aria-label="Fechar" onClick={() => janela.current?.close()}>
            ×
          </button>
        </header>
        <FormOpiniao key={chave} enviar={enviar} visitante={visitante} fechar={() => janela.current?.close()} />
      </dialog>
    </>
  );
}

function FormOpiniao({ enviar, visitante, fechar }: { enviar: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>; visitante: boolean; fechar: () => void }) {
  const [estado, acao, pendente] = useActionState(enviar, {});
  const tela = usePathname().split("/").slice(2).join("/") || "visão geral";
  useEffect(() => {
    if (!estado.ok) return;
    const t = setTimeout(fechar, 1800);
    return () => clearTimeout(t);
  }, [estado.ok, fechar]);
  if (estado.ok)
    return (
      <p className="opiniao-ok" role="status">
        {estado.ok}
      </p>
    );
  return (
    <form action={acao} className="opiniao-form">
      <input type="hidden" name="tela" value={tela} />
      <label className="campo">
        <span>Conte do seu jeito: o que faltou, o que atrapalhou, o que você esperava achar aqui.</span>
        <textarea name="texto" rows={5} required minLength={3} maxLength={2000} autoFocus aria-describedby={estado.erros?.texto ? "opiniao-erro" : undefined} />
      </label>
      {estado.erros?.texto && (
        <p className="erro" id="opiniao-erro" role="alert">
          {estado.erros.texto}
        </p>
      )}
      {visitante ? (
        <label className="campo">
          <span>Seu WhatsApp ou e-mail, se quiser resposta</span>
          <input name="retorno" maxLength={120} autoComplete="email" />
        </label>
      ) : (
        <label className="opiniao-contato">
          <input type="checkbox" name="contato" defaultChecked />
          Podem me chamar para conversar sobre isso
        </label>
      )}
      <div className="janela-pe">
        <span>Vai direto para a equipe Urutau.</span>
        <button className="botao" disabled={pendente}>
          {pendente ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
