import { notFound } from "next/navigation";
import { corDoPerfil } from "@/servidor/marca";
import { empresaPorSlug, horariosOnline } from "@/servidor/agenda-publica";
import { Agendar } from "./Agendar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const e = await empresaPorSlug((await params).slug);
  return { title: e ? `Agendar · ${e.empresa.nome}` : "Agendar" };
}

/** A página pública de agendamento: o link que a empresa põe na bio do Instagram e no WhatsApp. */
export default async function PaginaAgendar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await empresaPorSlug(slug);
  if (!e) notFound();
  const dias = await horariosOnline(e);
  const { cor, clara } = corDoPerfil(e.empresa.perfil);
  return (
    <main className="pub" style={{ "--cor": cor, "--cor-clara": clara } as React.CSSProperties}>
      <Agendar
        slug={slug}
        empresa={{ nome: e.empresa.nome, cidade: e.empresa.cidade }}
        atendimento={e.cfg.atendimento}
        rotuloServico={e.cfg.rotuloServico ?? "Tipo de atendimento"}
        servicos={e.cfg.servicos.length ? e.cfg.servicos : [e.cfg.atendimento]}
        duracao={e.cfg.duracao}
        dias={dias}
      />
      <p className="pub-rodape">Agenda feita pela Urutau</p>
    </main>
  );
}
