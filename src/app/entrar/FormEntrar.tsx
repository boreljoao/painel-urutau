"use client";

import { useActionState } from "react";
import { entrar } from "../acoes";

export function FormEntrar() {
  const [estado, enviar, pendente] = useActionState(entrar, {});
  return (
    <form action={enviar} className="entrar-form">
      <label className="campo">
        <span>E-mail</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={estado.valores?.email ?? ""} />
      </label>
      <label className="campo">
        <span>Senha</span>
        <input name="senha" type="password" autoComplete="current-password" required />
      </label>
      {estado.erros?._ && (
        <p role="alert" className="erro">
          {estado.erros._}
        </p>
      )}
      <button className="botao" disabled={pendente}>
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
