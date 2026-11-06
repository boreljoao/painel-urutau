"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cadastrar } from "../acoes";

export function FormCadastrar() {
  const [estado, enviar, pendente] = useActionState(cadastrar, {});
  const erro = (campo: string) =>
    estado.erros?.[campo] && (
      <small className="erro" id={`erro-${campo}`}>
        {estado.erros[campo]}
      </small>
    );
  return (
    <form action={enviar} className="entrar-form">
      <label className="campo">
        <span>Seu nome</span>
        <input name="nome" autoComplete="name" required minLength={2} maxLength={80} defaultValue={estado.valores?.nome ?? ""} aria-describedby={estado.erros?.nome ? "erro-nome" : undefined} />
        {erro("nome")}
      </label>
      <label className="campo">
        <span>E-mail</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={estado.valores?.email ?? ""} aria-describedby={estado.erros?.email ? "erro-email" : undefined} />
        {erro("email")}
      </label>
      <label className="campo">
        <span>Senha</span>
        <input name="senha" type="password" autoComplete="new-password" required minLength={8} aria-describedby="dica-senha" />
        <small className="nota" id="dica-senha">
          Pelo menos 8 caracteres.
        </small>
        {erro("senha")}
      </label>
      <label className="aceite">
        <input type="checkbox" name="aceite" required aria-describedby={estado.erros?.aceite ? "erro-aceite" : undefined} />
        <span>
          Li e aceito os <Link className="link" href="/termos" target="_blank">termos de uso</Link> e a{" "}
          <Link className="link" href="/privacidade" target="_blank">política de privacidade</Link>.
        </span>
      </label>
      {erro("aceite")}
      <label className="campo-isca" aria-hidden>
        Site
        <input name="site" tabIndex={-1} autoComplete="off" />
      </label>
      {estado.erros?._ && (
        <p role="alert" className="erro">
          {estado.erros._}
        </p>
      )}
      <button className="botao" disabled={pendente}>
        {pendente ? "Criando…" : "Criar conta"}
      </button>
    </form>
  );
}
