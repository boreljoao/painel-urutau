import { obterDb } from "@/db";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/servidor/acesso";
import { contaDaEmpresa, listarPosts } from "@/servidor/instagram";
import { Topo } from "@/componentes/Topo";
import { InstagramAoVivo } from "./AoVivo";

export const metadata = { title: "Instagram" };
export const dynamic = "force-dynamic";
// A IA escreve depois da resposta (after): o tempo da função precisa cobrir isso.
export const maxDuration = 60;

export default async function Instagram({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { papel } = await exigirAcesso(empresaId, "lancar");
  const db = obterDb();
  const [conta, posts] = await Promise.all([contaDaEmpresa(db, empresaId), listarPosts(db, empresaId)]);

  return (
    <>
      <Topo titulo="Instagram" sub="Diga o assunto: a IA escreve o post e a arte, o painel confere e envia pelo Buffer." />
      <InstagramAoVivo
        empresaId={empresaId}
        inicial={JSON.parse(JSON.stringify(posts))}
        conta={conta ? { canalNome: conta.canalNome } : null}
        podeLigar={pode(papel, "gerenciar")}
      />
    </>
  );
}
