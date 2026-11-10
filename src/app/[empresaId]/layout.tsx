import Link from "next/link";
import { obterDb } from "@/db";
import { NOME_PAPEL, pode } from "@/lib/permissoes";
import { resumoDaLoja } from "@/lib/servidor/atendimento";
import { contarParaConferir } from "@/lib/servidor/conferencia";
import { exigirAcesso } from "@/servidor/acesso";
import { corDoPerfil } from "@/servidor/marca";
import { NOME_SECAO, montarMenu } from "@/lib/navegacao";
import { Icone } from "@/componentes/Icone";
import { Mascote } from "@/componentes/Mascote";
import { Menu, type ItemMenu } from "@/componentes/Menu";
import { Opiniao } from "@/componentes/Opiniao";
import { ehDemo } from "@/lib/demo";
import { iniciais, tomDe } from "@/componentes/formato";
import { sair } from "../acoes";
import { enviarOpiniao } from "./opiniao-acoes";

export default async function LayoutEmpresa({ children, params }: { children: React.ReactNode; params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { empresa, papel, comoAdmin, modulos, usuario, config } = await exigirAcesso(empresaId);
  const db = obterDb();
  const temWhatsapp = modulos.has("whatsapp");
  const [aConferir, atendimento] = await Promise.all([
    pode(papel, "conferir") ? contarParaConferir(db, empresaId) : 0,
    temWhatsapp && pode(papel, "lancar") ? resumoDaLoja(db, empresaId) : null,
  ]);
  const esperando = atendimento ? atendimento.aprovar + atendimento.comEquipe + atendimento.naoLidas : 0;
  const base = `/${empresaId}`;
  const itens: ItemMenu[] = montarMenu({ perfil: empresa.perfil, papel, modulos, config }).map((i) => ({
    href: i.rota ? `${base}/${i.rota}` : base,
    nome: i.nome,
    icone: i.icone,
    secao: NOME_SECAO[i.secao],
    emBreve: i.emBreve,
    doNegocio: i.doNegocio,
    naBarra: i.naBarra,
    foraDaBarra: i.foraDaBarra,
  }));
  const ajuda = `https://wa.me/5521993689481?text=${encodeURIComponent(`Oi! Preciso de ajuda com o painel da ${empresa.nome}.`)}`;
  const marca = corDoPerfil(empresa.perfil);
  const visitante = ehDemo(usuario.email);

  return (
    <div className="app" style={{ "--cor": marca.cor, "--cor-clara": marca.clara } as React.CSSProperties}>
      <aside className="lado">
        <Link className="marca" href="/">
          <span className="marca-sinal">{empresa.nome[0]}</span>
          <span>{empresa.nome}</span>
        </Link>
        <Menu itens={itens} selos={{ [`${base}/whatsapp`]: esperando, [`${base}/vendas`]: aConferir }} />
        <div className="lado-pe">
          <nav className="lado-atalhos" aria-label="Conta">
            {pode(papel, "gerenciar") && (
              <Link href={`${base}/pacote`}>
                <Icone nome="ajustes" /> Seu pacote
              </Link>
            )}
            <a href={ajuda} target="_blank" rel="noreferrer">
              <Icone nome="ajuda" /> Ajuda e suporte
            </a>
          </nav>
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
      <main className="tela">
        {visitante && (
          <p className="faixa-demo">
            <span>
              <strong>Painel de exemplo.</strong> Os números são inventados e tudo some em um dia.
            </span>
            <Link className="botao-pequeno" href="/cadastrar">
              Criar a minha conta
            </Link>
          </p>
        )}
        {children}
        <footer className="tela-pe">
          <Opiniao enviar={enviarOpiniao.bind(null, empresaId)} visitante={visitante} />
          <nav className="tela-pe-links" aria-label="Documentos">
            <Link className="link" href="/termos">
              Termos de uso
            </Link>
            <Link className="link" href="/privacidade">
              Privacidade
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
