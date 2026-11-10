import { obterDb } from "@/db";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/servidor/acesso";
import { contaDaEmpresa, listarPosts } from "@/servidor/instagram";
import { Inicio } from "./Inicio";

export const metadata = { title: "Instagram" };
export const dynamic = "force-dynamic";
// A IA escreve depois da resposta (after); planejar a semana escreve até 5 posts em seguida.
export const maxDuration = 300;

export default async function Instagram({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { papel } = await exigirAcesso(empresaId, "lancar");
  const db = obterDb();
  const [conta, posts] = await Promise.all([contaDaEmpresa(db, empresaId), listarPosts(db, empresaId)]);
  return (
    <Inicio
      empresaId={empresaId}
      inicial={JSON.parse(JSON.stringify(posts))}
      conta={conta ? { canalNome: conta.canalNome } : null}
      podeLigar={pode(papel, "gerenciar")}
    />
  );
}
