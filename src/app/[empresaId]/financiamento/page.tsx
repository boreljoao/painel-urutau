import { exigirAcesso } from "@/servidor/acesso";
import { SimuladorFinanciamento } from "@/pacotes/SimuladorFinanciamento";

export const metadata = { title: "Simular financiamento" };
export const dynamic = "force-dynamic";

/** /financiamento?valor=480000,00&cliente=Ana&telefone=5521… (o funil manda já preenchido). */
export default async function Financiamento({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ valor?: string; cliente?: string; telefone?: string }> }) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  return (
    <div className="financiamento">
      <header className="agenda2-topo">
        <div>
          <h1>Simular financiamento</h1>
          <p>Parcelas no SAC e no Price, renda mínima e comparação entre bancos, para mandar ao cliente.</p>
        </div>
      </header>
      <SimuladorFinanciamento
        empresa={ctx.empresa.nome}
        inicial={{ valor: sp.valor?.slice(0, 20), cliente: sp.cliente?.slice(0, 80), telefone: sp.telefone?.replace(/\D/g, "").slice(0, 15) }}
      />
    </div>
  );
}
