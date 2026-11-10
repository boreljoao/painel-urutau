import Link from "next/link";
import { exigirUsuario } from "@/lib/servidor/auth";
import { CriarPainel } from "@/pacotes/CriarPainel";

export const metadata = { title: "Crie o painel do seu negócio" };
export const dynamic = "force-dynamic";

export default async function NovaEmpresa() {
  await exigirUsuario();
  return (
    <main className="cp-pagina">
      <Link className="cp-marca" href="/">
        <span className="marca-sinal" aria-hidden>U</span> Urutau
      </Link>
      <CriarPainel />
    </main>
  );
}
