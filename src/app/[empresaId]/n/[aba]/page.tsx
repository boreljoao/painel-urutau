import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigirAcesso } from "@/servidor/acesso";
import { pacoteDe } from "@/pacotes/catalogo";
import { Icone } from "@/componentes/Icone";
import { Topo } from "@/componentes/Topo";

export const dynamic = "force-dynamic";

/** Aba do pacote do negócio que ainda está sendo construída: mostra o que ela vai ter. */
export default async function AbaDoNegocio({ params }: { params: Promise<{ empresaId: string; aba: string }> }) {
  const { empresaId, aba: id } = await params;
  const { empresa } = await exigirAcesso(empresaId);
  const pacote = pacoteDe(empresa.perfil);
  const aba = pacote.abas.find((a) => a.id === id);
  if (!aba) notFound();
  if (aba.rota) redirect(`/${empresaId}/${aba.rota}`);
  const base = `/${empresaId}`;

  return (
    <>
      <Topo titulo={aba.titulo} sub={`${aba.desc} · ${pacote.nome}`} />
      <section className="cartao aba-breve">
        <span className="aba-icone">
          <Icone nome={aba.icone} />
        </span>
        <div>
          <p className="pilula">Em construção</p>
          <h2>O que esta aba vai ter</h2>
          <ul className="lista-check">
            {aba.vaiTer.map((t) => (
              <li key={t}>
                <Icone nome="check" />
                {t}
              </li>
            ))}
          </ul>
          <p className="nota">
            Tudo o que entrar aqui cai sozinho nas vendas, nas despesas e no caixa. Enquanto isso, lance pelo botão <b>Lançar</b> nas telas de{" "}
            <Link className="link" href={`${base}/vendas`}>
              {pacote.vocab.vendas.toLowerCase()}
            </Link>{" "}
            e{" "}
            <Link className="link" href={`${base}/financeiro`}>
              financeiro
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
