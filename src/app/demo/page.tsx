import Link from "next/link";
import { ehDemo } from "@/lib/demo";
import { obterUsuarioAtual } from "@/lib/servidor/auth";
import { pacoteDe } from "@/pacotes/catalogo";
import { RAMOS_DEMO, nomeDoExemplo } from "@/servidor/demo";
import { corDoPerfil } from "@/servidor/marca";
import { abrirDemo } from "./acoes";
import { RodapeLegal } from "../legal";

export const metadata = { title: "Painel de exemplo" };
export const dynamic = "force-dynamic";

export default async function Demo() {
  const usuario = await obterUsuarioAtual();
  const emOutraConta = usuario && !ehDemo(usuario.email);
  return (
    <main className="entrar">
      <section className="entrar-cartao escolher" aria-labelledby="demo-titulo">
        <h1 id="demo-titulo">Veja um painel de exemplo</h1>
        <p className="nota">Escolha o ramo. Abre uma empresa inventada com alguns meses de vendas, contas e clientes. Mexa à vontade: tudo some em um dia.</p>
        {emOutraConta && <p className="nota aviso-demo">Você vai sair da conta de {usuario.nome.split(" ")[0]} para abrir o exemplo.</p>}
        <ul className="lista-empresas">
          {RAMOS_DEMO.map((perfil) => {
            const p = pacoteDe(perfil);
            return (
              <li key={perfil}>
                <form action={abrirDemo.bind(null, perfil)}>
                  <button style={{ "--cor": corDoPerfil(perfil).cor } as React.CSSProperties}>
                    <span className="marca-sinal">{p.nome[0]}</span>
                    <span>
                      <strong>{p.nome}</strong>
                      <span className="nota">
                        {nomeDoExemplo(perfil)} · {p.frase}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        <p className="nota entrar-troca">
          Gostou? <Link className="link" href="/cadastrar">Criar a minha conta</Link>
        </p>
      </section>
      <RodapeLegal />
    </main>
  );
}
