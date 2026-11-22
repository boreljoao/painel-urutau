import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { obterDb } from "@/db";
import { type StatusImovel, clientes } from "@/db/schema";
import { centavosParaInput } from "@/lib/dinheiro";
import { hoje, somarDias } from "@/lib/datas";
import { NOME_STATUS_IMOVEL, fichaWhatsapp, nomeTipo, precoM2, proximoCodigo, valorAnunciado } from "@/lib/imobiliaria";
import { pode } from "@/lib/permissoes";
import { type FiltroImoveis, codigosDaEmpresa, imovelDaEmpresa, listarImoveis, painelImobiliaria } from "@/lib/servidor/imobiliaria";
import { exigirAcesso } from "@/servidor/acesso";
import { corDoPerfil } from "@/servidor/marca";
import { excluirImovelAcao, salvarImovelAcao, statusImovelAcao } from "@/pacotes/imobiliaria-acoes";
import { ImovelCapa } from "@/pacotes/ImovelCapa";
import { JanelaImovel } from "@/pacotes/imovel-janela";
import { AoVivo } from "@/componentes/AoVivo";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";
import { pulsoDaEmpresa } from "../pulso";

export const metadata = { title: "Imóveis" };
export const dynamic = "force-dynamic";

const FILTROS: { id: string; nome: string; f: FiltroImoveis }[] = [
  { id: "ativos", nome: "Na carteira", f: { status: "ativos" } },
  { id: "venda", nome: "À venda", f: { status: "ativos", finalidade: "venda" } },
  { id: "aluguel", nome: "Para alugar", f: { status: "ativos", finalidade: "aluguel" } },
  { id: "reservado", nome: "Reservados", f: { status: "reservado" } },
  { id: "alugado", nome: "Alugados", f: { status: "alugado" } },
  { id: "vendido", nome: "Vendidos", f: { status: "vendido" } },
  { id: "suspenso", nome: "Suspensos", f: { status: "suspenso" } },
];

const reaisCampo = (c: number | null) => (c ? centavosParaInput(c) : "");
const pcmCampo = (p: number) => String(p / 1000).replace(".", ",");

export default async function Imoveis({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ ver?: string; q?: string; novo?: string; editar?: string }> }) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const podeLancar = pode(ctx.papel, "lancar");
  const filtro = FILTROS.find((f) => f.id === sp.ver) ?? FILTROS[0];
  const db = obterDb();
  const hj = hoje();
  const [lista, resumo, editando, codigos, proprietarios] = await Promise.all([
    listarImoveis(db, empresaId, { ...filtro.f, busca: sp.q }),
    painelImobiliaria(db, empresaId, hj),
    sp.editar && podeLancar ? imovelDaEmpresa(db, empresaId, sp.editar) : null,
    sp.novo && podeLancar ? codigosDaEmpresa(db, empresaId) : [],
    podeLancar && (sp.novo || sp.editar)
      ? db.select({ id: clientes.id, nome: clientes.nome }).from(clientes).where(and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm))).orderBy(asc(clientes.nome))
      : [],
  ]);
  const cor = corDoPerfil(ctx.empresa.perfil).cor;
  const base = `/${empresaId}/imoveis`;
  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ ver: filtro.id === "ativos" ? undefined : filtro.id, q: sp.q, ...extra }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `${base}?${q}` : base;
  };
  const fechar = link({});
  const c = resumo.carteira;

  let janela: React.ReactNode = null;
  if (podeLancar && sp.novo)
    janela = (
      <JanelaImovel
        titulo="Imóvel novo"
        salvar={salvarImovelAcao.bind(null, empresaId, null)}
        inicial={{ codigo: proximoCodigo("apartamento", codigos), tipo: "apartamento", finalidade: "venda", cidade: ctx.empresa.cidade ?? "", comissao: "6" }}
        hoje={hj}
        fechar={fechar}
        proprietarios={proprietarios}
      />
    );
  else if (editando) {
    const i = editando;
    janela = (
      <JanelaImovel
        titulo={`${i.codigo} · ${i.titulo}`}
        salvar={salvarImovelAcao.bind(null, empresaId, i.id)}
        inicial={{
          codigo: i.codigo,
          titulo: i.titulo,
          tipo: i.tipo,
          finalidade: i.finalidade,
          bairro: i.bairro,
          cidade: i.cidade,
          endereco: i.endereco,
          areaM2: i.areaM2?.toString() ?? "",
          quartos: i.quartos?.toString() ?? "",
          suites: i.suites?.toString() ?? "",
          banheiros: i.banheiros?.toString() ?? "",
          vagas: i.vagas?.toString() ?? "",
          precoVenda: reaisCampo(i.precoVendaCentavos),
          aluguel: reaisCampo(i.aluguelCentavos),
          condominio: reaisCampo(i.condominioCentavos),
          iptu: reaisCampo(i.iptuCentavos),
          destaques: i.destaques.join(", "),
          fotos: i.fotos.join("\n"),
          descricao: i.descricao,
          proprietarioId: i.proprietarioId ?? "",
          corretor: i.corretor,
          comissao: pcmCampo(i.comissaoPcm),
          exclusivo: i.exclusivo ? "on" : "",
          captadoEm: i.captadoEm,
        }}
        hoje={hj}
        fechar={fechar}
        proprietarios={proprietarios}
        edicao={{
          status: i.status,
          mudar: statusImovelAcao.bind(null, empresaId, i.id) as (s: StatusImovel) => Promise<{ erro?: string }>,
          excluir: pode(ctx.papel, "gerenciar") ? excluirImovelAcao.bind(null, empresaId, i.id) : undefined,
          ficha: fichaWhatsapp(i, ctx.empresa.nome),
        }}
      />
    );
  }

  return (
    <div className="imoveis">
      <header className="agenda2-topo">
        <div>
          <h1>Imóveis</h1>
          <p>
            {c.disponiveis} na carteira · {c.venda} à venda · {c.aluguel} para alugar
          </p>
        </div>
        <div className="topo-acoes">
          <AoVivo pulso={pulsoDaEmpresa.bind(null, empresaId)} />
          {podeLancar && (
            <Link className="botao" href={link({ novo: "1" })} scroll={false}>
              + Imóvel
            </Link>
          )}
        </div>
      </header>

      <section className="patio-resumo" aria-label="Resumo da carteira">
        <div className="cartao">
          <span>Valor à venda (VGV)</span>
          <strong>{reais(c.vgv)}</strong>
          <small>Comissão possível {reais(c.comissaoPotencial)}</small>
        </div>
        <div className="cartao">
          <span>Para alugar</span>
          <strong>{c.aluguel}</strong>
          <small>{c.alugados} alugados pela imobiliária</small>
        </div>
        <div className="cartao">
          <span>Captados em 30 dias</span>
          <strong>{c.captados30d}</strong>
        </div>
        <Link href={link({ ver: undefined })} className={`cartao ${c.paradosMais90 ? "alerta" : ""}`}>
          <span>Disponíveis há mais de 90 dias</span>
          <strong>{c.paradosMais90}</strong>
          <small>Hora de rever preço ou fotos</small>
        </Link>
      </section>

      <div className="estoque-barra">
        <nav className="agenda2-chips" aria-label="Filtrar">
          {FILTROS.map((f) => (
            <Link key={f.id} href={link({ ver: f.id === "ativos" ? undefined : f.id })} className={`agenda2-chip${filtro.id === f.id ? " ativo" : ""}`}>
              {f.nome}
            </Link>
          ))}
        </nav>
        <form className="estoque-busca" action={base}>
          {filtro.id !== "ativos" && <input type="hidden" name="ver" value={filtro.id} />}
          <Icone nome="busca" />
          <input name="q" defaultValue={sp.q} placeholder="Código, bairro ou título" aria-label="Buscar imóvel" />
        </form>
      </div>

      {lista.length ? (
        <ul className="imoveis-grade">
          {lista.map((i) => {
            const m2 = precoM2(i.precoVendaCentavos, i.areaM2);
            const novo = i.captadoEm >= somarDias(hj, -14);
            const conteudo = (
              <>
                <span className="imovel-topo">
                  <ImovelCapa codigo={i.codigo} tipo={i.tipo} foto={i.fotos[0]} cor={cor} alt={`${nomeTipo(i.tipo)} em ${i.bairro}`} />
                  <span className="imovel-selos">
                    <span className="imovel-codigo">{i.codigo}</span>
                    {i.exclusivo && <span className="imovel-selo">Exclusivo</span>}
                    {novo && <span className="imovel-selo novo">Novo</span>}
                  </span>
                  {i.status !== "disponivel" && <span className={`pilula imovel-st-${i.status} imovel-status`}>{NOME_STATUS_IMOVEL[i.status]}</span>}
                </span>
                <span className="imovel-corpo">
                  <small className="imovel-onde">
                    {nomeTipo(i.tipo)} · {[i.bairro, i.cidade].filter(Boolean).join(", ")}
                  </small>
                  <strong className="imovel-titulo">{i.titulo}</strong>
                  <span className="imovel-specs">
                    {i.areaM2 ? (
                      <span>
                        <Icone nome="area" /> {i.areaM2} m²
                      </span>
                    ) : null}
                    {i.quartos ? (
                      <span>
                        <Icone nome="cama" /> {i.quartos} {i.quartos === 1 ? "quarto" : "quartos"}
                        {i.suites ? ` · ${i.suites} suíte${i.suites > 1 ? "s" : ""}` : ""}
                      </span>
                    ) : null}
                    {i.vagas ? (
                      <span>
                        <Icone nome="vaga" /> {i.vagas} {i.vagas === 1 ? "vaga" : "vagas"}
                      </span>
                    ) : null}
                  </span>
                  <span className="imovel-preco">
                    <b>{valorAnunciado(i)}</b>
                    {m2 && i.finalidade !== "aluguel" ? <small>{reais(m2)}/m²</small> : null}
                  </span>
                  {i.destaques.length > 0 && (
                    <span className="imovel-tags">
                      {i.destaques.slice(0, 3).map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </span>
                  )}
                  <span className="imovel-rodape">
                    <span>{i.corretor || "Sem corretor"}</span>
                    <span>
                      {i.interessados} {i.interessados === 1 ? "interessado" : "interessados"} · {i.visitas30d} {i.visitas30d === 1 ? "visita" : "visitas"}
                    </span>
                  </span>
                </span>
              </>
            );
            return (
              <li key={i.id}>
                {podeLancar ? (
                  <Link href={link({ editar: i.id })} scroll={false} className="imovel-card">
                    {conteudo}
                  </Link>
                ) : (
                  <div className="imovel-card">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="vazio-grande cartao">
          <Icone nome="predio" />
          <p>{sp.q ? `Nenhum imóvel encontrado para “${sp.q}”.` : filtro.id === "ativos" ? "A carteira está vazia. Cadastre o primeiro imóvel: a ficha para o WhatsApp sai pronta." : "Nenhum imóvel neste filtro."}</p>
          {podeLancar && filtro.id === "ativos" && !sp.q && (
            <Link className="botao" href={link({ novo: "1" })} scroll={false}>
              + Imóvel
            </Link>
          )}
        </div>
      )}
      {janela}
    </div>
  );
}
