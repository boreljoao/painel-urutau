import Link from "next/link";
import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/servidor/auth";
import { FormEntrar } from "./FormEntrar";
import { RodapeLegal } from "../legal";

export const metadata = { title: "Entrar" };

export default async function Entrar() {
  if (await obterUsuarioAtual()) redirect("/");
  return (
    <main className="entrar">
      <section className="entrar-cartao" aria-labelledby="entrar-titulo">
        <span className="marca-sinal entrar-sinal" aria-hidden>
          P
        </span>
        <h1 id="entrar-titulo">Entrar no painel</h1>
        <p className="nota">Use o seu e-mail e a sua senha.</p>
        <FormEntrar />
        <p className="nota entrar-troca">
          Ainda não tem conta? <Link className="link" href="/cadastrar">Criar conta</Link>
        </p>
        <p className="nota entrar-troca">
          Quer olhar antes? <Link className="link" href="/demo">Ver um painel de exemplo</Link>
        </p>
      </section>
      <RodapeLegal />
    </main>
  );
}
