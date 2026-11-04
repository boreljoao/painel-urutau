import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/servidor/auth";
import { FormEntrar } from "./FormEntrar";

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
        <p className="nota">Use o e-mail e a senha que a Urutau te passou.</p>
        <FormEntrar />
      </section>
      <p className="feito">Painel feito pela Urutau</p>
    </main>
  );
}
