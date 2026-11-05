import Link from "next/link";
import { redirect } from "next/navigation";
import { NOME_PAPEL } from "@/lib/permissoes";
import { pacoteDe } from "@/pacotes/catalogo";
import { exigirUsuario } from "@/lib/servidor/auth";
import { empresasDoUsuario, telaInicial } from "@/servidor/acesso";
import { corDoPerfil } from "@/servidor/marca";
import { sair } from "./acoes";

export const dynamic = "force-dynamic";

/** Quem tem uma empresa só vai direto para ela; quem tem mais escolhe aqui. */
export default async function Inicio() {
  const usuario = await exigirUsuario();
  const lista = await empresasDoUsuario(usuario);
  if (lista.length === 1 && !usuario.superadmin) redirect(telaInicial(lista[0].id, lista[0].papel));
  return (
    <main className="entrar">
      <section className="entrar-cartao escolher" aria-labelledby="escolher-titulo">
        <h1 id="escolher-titulo">Olá, {usuario.nome.split(" ")[0]}</h1>
        <p className="nota">{lista.length ? "Escolha a empresa." : "Sua conta ainda não tem nenhuma empresa. Crie a primeira: o painel se monta para o seu ramo."}</p>
        <ul className="lista-empresas">
          {lista.map((e) => (
            <li key={e.id}>
              <Link href={telaInicial(e.id, e.papel)} style={{ "--cor": corDoPerfil(e.perfil).cor } as React.CSSProperties}>
                <span className="marca-sinal">{e.nome[0]}</span>
                <span>
                  <strong>{e.nome}</strong>
                  <span className="nota">
                    {pacoteDe(e.perfil).nome}
                    {e.cidade ? ` · ${e.cidade}` : ""} · {NOME_PAPEL[e.papel]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="botao" href="/nova-empresa">
          + Criar {lista.length ? "outra" : "minha"} empresa
        </Link>
        <form action={sair}>
          <button className="botao-claro">Sair</button>
        </form>
      </section>
    </main>
  );
}
