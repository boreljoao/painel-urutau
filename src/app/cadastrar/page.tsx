import Link from "next/link";
import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/servidor/auth";
import { FormCadastrar } from "./FormCadastrar";
import { RodapeLegal } from "../legal";

export const metadata = { title: "Criar conta" };

export default async function Cadastrar() {
  if (await obterUsuarioAtual()) redirect("/");
  return (
    <main className="entrar">
      <section className="entrar-cartao" aria-labelledby="cadastrar-titulo">
        <span className="marca-sinal entrar-sinal" aria-hidden>
          P
        </span>
        <h1 id="cadastrar-titulo">Criar a sua conta</h1>
        <p className="nota">Depois você conta o que a sua empresa faz e o painel se monta para o seu ramo.</p>
        <FormCadastrar />
        <p className="nota entrar-troca">
          Já tem conta? <Link className="link" href="/entrar">Entrar</Link>
        </p>
        <p className="nota entrar-troca">
          Quer olhar antes? <Link className="link" href="/demo">Ver um painel de exemplo</Link>
        </p>
      </section>
      <RodapeLegal />
    </main>
  );
}
