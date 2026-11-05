import Link from "next/link";
import { exigirUsuario } from "@/lib/servidor/auth";
import { criarEmpresaComPacote, sugerirPacote } from "@/pacotes/acoes";
import { Comecar } from "@/pacotes/componentes";

export const metadata = { title: "Criar empresa" };
export const dynamic = "force-dynamic";

export default async function NovaEmpresa() {
  await exigirUsuario();
  return (
    <main className="entrar">
      <section className="entrar-cartao comecar" aria-labelledby="comecar-titulo">
        <Link className="link" href="/">
          ← Voltar
        </Link>
        <h1 id="comecar-titulo">Vamos montar o seu painel</h1>
        <p className="nota">Conte o que a sua empresa faz. O painel se monta para o seu ramo: abas, categorias e as palavras que você usa.</p>
        <Comecar sugerir={sugerirPacote} criar={criarEmpresaComPacote} />
      </section>
    </main>
  );
}
