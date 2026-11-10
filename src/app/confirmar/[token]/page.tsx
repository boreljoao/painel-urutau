import { notFound } from "next/navigation";
import { corDoPerfil } from "@/servidor/marca";
import { agendamentoPorToken, empresaPorSlug, horariosOnline, jaPassou } from "@/servidor/agenda-publica";
import { Paciente } from "./Paciente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu horário", robots: { index: false } };

/** A página do paciente: o link que vai nos lembretes, para confirmar, remarcar ou cancelar. */
export default async function PaginaPaciente({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { token } = await params;
  const { novo } = await searchParams;
  const a = await agendamentoPorToken(token);
  if (!a) notFound();
  const online = a.config?.slug && a.config.agendaOnline ? await empresaPorSlug(a.config.slug) : null;
  const dias = online ? await horariosOnline(online, a.ag.id) : [];
  const { cor, clara } = corDoPerfil(a.empresa.perfil);
  return (
    <main className="pub" style={{ "--cor": cor, "--cor-clara": clara } as React.CSSProperties}>
      <Paciente
        token={token}
        novo={!!novo}
        empresa={{ nome: a.empresa.nome, cidade: a.empresa.cidade }}
        horario={{ nome: a.ag.nome, data: a.ag.data, hora: a.ag.hora, duracao: a.ag.duracaoMin, servico: a.ag.servico || a.cfg?.atendimento || "Horário", status: a.ag.status }}
        passou={jaPassou(a.ag)}
        podeRemarcar={!!online}
        dias={dias}
      />
      <p className="pub-rodape">Agenda feita pela Urutau</p>
    </main>
  );
}
