import Link from "next/link";
import { obterDb } from "@/db";
import { NOME_PAPEL, pode } from "@/lib/permissoes";
import { resumoDaLoja } from "@/lib/servidor/atendimento";
import { contarParaConferir } from "@/lib/servidor/conferencia";
import { exigirAcesso } from "@/servidor/acesso";
import { corDoPerfil } from "@/servidor/marca";
import { pacoteDe } from "@/pacotes/catalogo";
import { Mascote } from "@/componentes/Mascote";
import { Menu, type ItemMenu } from "@/componentes/Menu";
import { iniciais, tomDe } from "@/componentes/formato";
import { sair } from "../acoes";

export default async function LayoutEmpresa({ children, params }: { children: React.ReactNode; params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { empresa, papel, comoAdmin, modulos, usuario } = await exigirAcesso(empresaId);
  const db = obterDb();
  const temWhatsapp = modulos.has("whatsapp");
  const [aConferir, atendimento] = await Promise.all([
    pode(papel, "conferir") ? contarParaConferir(db, empresaId) : 0,
    temWhatsapp && pode(papel, "lancar") ? resumoDaLoja(db, empresaId) : null,
  ]);
  const esperando = atendimento ? atendimento.aprovar + atendimento.comEquipe + atendimento.naoLidas : 0;
  const base = `/${empresaId}`;
  const pacote = pacoteDe(empresa.perfil);
  const itens: ItemMenu[] = [
    pode(papel, "ver_painel") && { href: base, nome: "Visão geral", icone: "inicio" as const },
    pode(papel, "ver_lancamentos") && { href: `${base}/vendas`, nome: pacote.vocab.vendas, icone: "vendas" as const },
    pode(papel, "ver_clientes") && { href: `${base}/clientes`, nome: pacote.vocab.clientes, icone: "clientes" as const },
    temWhatsapp && pode(papel, "ver_clientes") && { href: `${base}/whatsapp`, nome: "WhatsApp", icone: "whatsapp" as const },
    pode(papel, "ver_painel") && { href: `${base}/financeiro`, nome: "Financeiro", icone: "financeiro" as const },
    // As abas do ramo: o que faz este painel ser de uma confeitaria, de uma revenda, de um consultório…
    ...pacote.abas.map((a) => ({ href: a.rota ? `${base}/${a.rota}` : `${base}/n/${a.id}`, nome: a.titulo, icone: a.icone, doNegocio: true, emBreve: !a.rota })),
    pode(papel, "gerenciar") && { href: `${base}/pacote`, nome: "Seu pacote", icone: "ajustes" as const, doNegocio: true },
  ].filter(Boolean) as ItemMenu[];
  const marca = corDoPerfil(empresa.perfil);

  return (
    <div className="app" style={{ "--cor": marca.cor, "--cor-clara": marca.clara } as React.CSSProperties}>
      <aside className="lado">
        <Link className="marca" href="/">
          <span className="marca-sinal">{empresa.nome[0]}</span>
          <span>{empresa.nome}</span>
        </Link>
        <Menu itens={itens} selos={{ [`${base}/whatsapp`]: esperando, [`${base}/vendas`]: aConferir }} />
        <div className="lado-pe">
          {comoAdmin && <p className="aviso-equipe">Você está vendo como equipe Urutau.</p>}
          <div className="pessoa">
            <span className="avatar" style={{ background: tomDe(usuario.nome) }}>
              {iniciais(usuario.nome)}
            </span>
            <div>
              <p>{usuario.nome}</p>
              <span className="papel">{comoAdmin ? "Equipe Urutau" : NOME_PAPEL[papel]}</span>
            </div>
            <form action={sair}>
              <button className="sair" aria-label="Sair">
                <svg viewBox="0 0 24 24" className="ic" aria-hidden="true">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
                </svg>
              </button>
            </form>
          </div>
          <Mascote empresa={empresa.nome} />
        </div>
      </aside>
      <main className="tela">{children}</main>
    </div>
  );
}
