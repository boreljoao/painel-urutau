import { exigirAcesso } from "@/servidor/acesso";
import { trocarPacote } from "@/pacotes/acoes";
import { ESPECIALIDADES, pacoteDe } from "@/pacotes/catalogo";
import { ConfigPainel } from "@/pacotes/ConfigPainel";
import { TrocarPacote } from "@/pacotes/componentes";
import { NOME_SECAO, itensDoRamo, telaInicialPadrao } from "@/lib/navegacao";
import { Topo } from "@/componentes/Topo";
import { agendaDoPacote } from "@/pacotes/catalogo";
import { urlPublica } from "@/servidor/instagram";

export const metadata = { title: "Seu pacote" };
export const dynamic = "force-dynamic";

export default async function SeuPacote({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { empresa, modulos, config } = await exigirAcesso(empresaId, "gerenciar");
  const pacote = pacoteDe(empresa.perfil);
  const ramo = itensDoRamo({ perfil: empresa.perfil, papel: "dono", modulos });
  const escolhas = new Map((config?.menu ?? []).map((c, i) => [c.id, { ...c, ordem: i }]));
  const itens = ramo
    .map((i, n) => {
      const c = escolhas.get(i.id);
      return { id: i.id, nomePadrao: i.nome, icone: i.icone, secao: NOME_SECAO[i.secao], nome: c?.nome ?? i.nome, oculto: !!c?.oculto, emBreve: i.emBreve, ordem: c ? c.ordem : 1000 + n };
    })
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ ordem: _, ...i }) => i);
  const sugestao = empresa.nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const online = agendaDoPacote(empresa.perfil)
    ? { ligado: config?.agendaOnline ?? false, slug: config?.slug ?? sugestao, antecedenciaHoras: config?.antecedenciaHoras ?? 2, diasOnline: config?.diasOnline ?? 14, base: urlPublica() }
    : null;
  const meta = config?.metaCentavos ? (config.metaCentavos / 100).toLocaleString("pt-BR") : "";
  return (
    <>
      <Topo titulo="Seu pacote" sub={`Hoje o painel está montado para ${pacote.nome.toLowerCase()}.`} />
      <section className="cartao">
        <h2>Como o painel aparece para a empresa</h2>
        <ConfigPainel
          empresaId={empresaId}
          itens={itens}
          ordemPadrao={ramo.map((i) => i.id)}
          telaInicial={config?.telaInicial ?? telaInicialPadrao(empresa.perfil)}
          especialidade={config?.especialidade ?? null}
          especialidades={empresa.perfil === "consultorio" ? Object.entries(ESPECIALIDADES).map(([id, e]) => ({ id, nome: e.nome })) : null}
          meta={meta}
          online={online}
        />
      </section>
      <section className="cartao">
        <TrocarPacote atual={empresa.perfil} trocar={trocarPacote.bind(null, empresaId)} />
      </section>
    </>
  );
}
