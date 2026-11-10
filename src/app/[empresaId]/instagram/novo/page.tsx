import { obterDb } from "@/db";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/servidor/acesso";
import { OBJETIVOS, contaDaEmpresa, postDaEmpresa } from "@/servidor/instagram";
import { NovoPost } from "./NovoPost";

export const metadata = { title: "Novo post · Instagram" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Novo({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ id?: string }> }) {
  const { empresaId } = await params;
  const { id } = await searchParams;
  const { papel, empresa } = await exigirAcesso(empresaId, "lancar");
  const db = obterDb();
  const [conta, post] = await Promise.all([contaDaEmpresa(db, empresaId), id ? postDaEmpresa(db, empresaId, id) : null]);
  return (
    <NovoPost
      empresaId={empresaId}
      empresaNome={empresa.nome}
      conta={conta ? { canalNome: conta.canalNome } : null}
      podeLigar={pode(papel, "gerenciar")}
      inicial={post ? JSON.parse(JSON.stringify(post)) : null}
      objetivos={[...OBJETIVOS]}
    />
  );
}
