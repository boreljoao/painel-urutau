import { exigirAcesso } from "@/servidor/acesso";
import { trocarPacote } from "@/pacotes/acoes";
import { pacoteDe } from "@/pacotes/catalogo";
import { TrocarPacote } from "@/pacotes/componentes";
import { Topo } from "@/componentes/Topo";

export const metadata = { title: "Seu pacote" };
export const dynamic = "force-dynamic";

export default async function SeuPacote({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { empresa } = await exigirAcesso(empresaId, "gerenciar");
  const pacote = pacoteDe(empresa.perfil);
  return (
    <>
      <Topo titulo="Seu pacote" sub={`Hoje o painel está montado para ${pacote.nome.toLowerCase()}.`} />
      <section className="cartao">
        <TrocarPacote atual={empresa.perfil} trocar={trocarPacote.bind(null, empresaId)} />
      </section>
    </>
  );
}
