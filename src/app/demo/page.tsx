import Link from "next/link";
import { ehDemo } from "@/lib/demo";
import { obterUsuarioAtual } from "@/lib/servidor/auth";
import { pacoteDe } from "@/pacotes/catalogo";
import { RAMOS_DEMO, nomeDoExemplo } from "@/servidor/demo";
import { corDoPerfil } from "@/servidor/marca";
import { abrirDemo } from "./acoes";
import { RodapeLegal } from "../legal";
import { LimparEndereco } from "./LimparEndereco";

export const metadata = { title: "Painel de exemplo" };
export const dynamic = "force-dynamic";

/**
 * Link para mandar a um cliente: /demo?ramo=imobiliaria abre a página com esse ramo em destaque
 * (o exemplo só é criado no clique, para a prévia do link no WhatsApp não abrir um à toa).
 */
export default async function Demo({ searchParams }: { searchParams: Promise<{ limite?: string; ramo?: string }> }) {
  const { limite, ramo } = await searchParams;
  const foco = RAMOS_DEMO.find((r) => r === ramo) ?? null;
  const ramos = foco ? [foco, ...RAMOS_DEMO.filter((r) => r !== foco)] : RAMOS_DEMO;
  const usuario = await obterUsuarioAtual();
  const emOutraConta = usuario && !ehDemo(usuario.email);
  return (
    <main className="entrar">
      <section className="entrar-cartao escolher" aria-labelledby="demo-titulo">
        <h1 id="demo-titulo">{foco ? `Veja o painel de ${pacoteDe(foco).nome.toLowerCase()}` : "Veja um painel de exemplo"}</h1>
        <p className="nota">
          {foco ? "Toque abaixo para abrir. É uma empresa inventada" : "Escolha o ramo. Abre uma empresa inventada"} com alguns meses de vendas, contas e clientes. Mexa à vontade: tudo some em um dia.
        </p>
        {limite && (
          <p className="nota aviso-demo" role="alert">
            Muitos exemplos abertos agora. Espere um pouco e tente de novo, ou crie a sua conta.
            <LimparEndereco />
          </p>
        )}
        {emOutraConta && <p className="nota aviso-demo">Você vai sair da conta de {usuario.nome.split(" ")[0]} para abrir o exemplo.</p>}
        <ul className="lista-empresas">
          {ramos.map((perfil, n) => {
            const p = pacoteDe(perfil);
            return (
              <li key={perfil} className={foco && n === 0 ? "demo-foco" : undefined}>
                {foco && n === 1 && <p className="nota demo-outros">Outros ramos</p>}
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
