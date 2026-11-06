"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/db";
import { type Perfil, auditoria, categoriasDespesa, empresas, fontesReceita } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { PERFIS } from "@/lib/perfis";
import { criarPadrao } from "@/lib/servidor/atendimento";
import { exigirUsuario } from "@/lib/servidor/auth";
import { UFS, errosPorCampo, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "@/servidor/acesso";
import { montarEmpresa } from "@/servidor/empresa-nova";
import { ORDEM_PACOTES, PACOTES, escolherPorPalavras } from "./catalogo";

export interface Sugestao {
  perfil: Perfil;
  motivo: string;
  /** true quando quem escolheu foi a IA; false quando foi a busca por palavras. */
  viaIa: boolean;
}

const MODELO = "claude-haiku-5-5";

const respostaIa = z.object({ perfil: z.enum(ORDEM_PACOTES as [Perfil, ...Perfil[]]), motivo: z.string().min(3).max(300) });

/**
 * A pessoa conta com as próprias palavras o que a empresa faz e a IA escolhe o pacote.
 * Sem a chave da IA, ou se ela falhar, escolhe pelas palavras do ramo: a entrada nunca trava.
 */
export async function sugerirPacote(descricao: string): Promise<Sugestao> {
  await exigirUsuario();
  const texto = descricao.trim().slice(0, 600);
  const porPalavras = (): Sugestao => {
    const r = escolherPorPalavras(texto);
    return {
      perfil: r.perfil,
      motivo: r.achou.length ? `Pelo que você escreveu (${r.achou.slice(0, 3).join(", ")}), este é o pacote mais perto do seu negócio.` : "Não reconheci o ramo pela descrição. Comece com as finanças e troque de pacote quando quiser.",
      viaIa: false,
    };
  };
  if (texto.length < 4) return porPalavras();

  const lista = ORDEM_PACOTES.map((p) => `- ${p}: ${PACOTES[p].nome}. ${PACOTES[p].frase}`).join("\n");
  try {
    const r = await criarPadrao({
      model: MODELO,
      max_tokens: 300,
      system: `Você ajuda donos de pequenas empresas brasileiras a configurar um painel de gestão. Escolha o pacote que mais combina com o negócio descrito pelo usuário. Use "financas" só quando nenhum outro servir. O motivo é uma frase curta em português, falando com o dono ("você"), sem repetir o nome do pacote.\n\nPacotes:\n${lista}`,
      tools: [
        {
          name: "escolher_pacote",
          description: "Registra o pacote escolhido para a empresa.",
          input_schema: {
            type: "object",
            properties: {
              perfil: { type: "string", enum: ORDEM_PACOTES },
              motivo: { type: "string", description: "Uma frase curta explicando a escolha para o dono." },
            },
            required: ["perfil", "motivo"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "escolher_pacote" },
      messages: [{ role: "user", content: texto }],
    });
    const bloco = r.content.find((b) => b.type === "tool_use");
    const lido = respostaIa.safeParse(bloco && "input" in bloco ? bloco.input : null);
    if (!lido.success) return porPalavras();
    return { ...lido.data, viaIa: true };
  } catch (e) {
    console.error("sugerirPacote: IA indisponível, escolhendo por palavras.", e instanceof Error ? e.message : e);
    return porPalavras();
  }
}

const esquemaCriar = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa").max(120),
  perfil: z.enum(ORDEM_PACOTES as [Perfil, ...Perfil[]], { message: "Escolha um pacote" }),
  regime: z.enum(["mei", "simples", "presumido", "nao_sei"], { message: "Escolha como a empresa paga imposto" }),
  cidade: z.string().trim().max(80).optional(),
  uf: z.string().trim().toUpperCase().optional(),
});

/** Cria a empresa já moldada ao pacote: categorias, fontes de receita, módulos e o ponto de partida do imposto. */
export async function criarEmpresaComPacote(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const valores = formParaObjeto(fd);
  const r = esquemaCriar.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const { nome, perfil, regime, cidade, uf } = r.data;
  if (uf && !(UFS as readonly string[]).includes(uf)) return { erros: { uf: "UF inválida" }, valores };
  const criada = await montarEmpresa(usuario.id, { nome, perfil, regime, cidade, uf });
  if ("erro" in criada) return { erros: { _: criada.erro }, valores };
  const id = criada.id;
  redirect(`/${id}`);
}

/**
 * Troca o pacote de uma empresa que já existe. Nada é apagado: só acrescenta as categorias e as
 * fontes de receita do novo ramo que ainda não existem (pelo nome).
 */
export async function trocarPacote(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "gerenciar");
  const lido = z.enum(ORDEM_PACOTES as [Perfil, ...Perfil[]]).safeParse(fd.get("perfil"));
  if (!lido.success) return { erros: { perfil: "Escolha um pacote" } };
  const perfil = lido.data;
  if (perfil === ctx.empresa.perfil) return { ok: "Esse já é o seu pacote." };
  const p = PACOTES[perfil];
  const db = obterDb();
  await db.transaction(async (tx) => {
    await tx.update(empresas).set({ perfil, atualizadoEm: new Date() }).where(eq(empresas.id, empresaId));
    const nomesCat = p.categoriasExtras.map((c) => c.nome);
    const jaCat = nomesCat.length
      ? new Set((await tx.select({ nome: categoriasDespesa.nome }).from(categoriasDespesa).where(and(eq(categoriasDespesa.empresaId, empresaId), inArray(categoriasDespesa.nome, nomesCat)))).map((c) => c.nome))
      : new Set<string>();
    const novasCat = p.categoriasExtras.filter((c) => !jaCat.has(c.nome));
    if (novasCat.length) await tx.insert(categoriasDespesa).values(novasCat.map((c, i) => ({ empresaId, nome: c.nome, comportamento: c.comportamento, ordem: 20 + i })));
    const fontes = PERFIS[perfil].fontes ?? [];
    const jaFon = fontes.length
      ? new Set((await tx.select({ nome: fontesReceita.nome }).from(fontesReceita).where(and(eq(fontesReceita.empresaId, empresaId), inArray(fontesReceita.nome, fontes.map((f) => f.nome))))).map((f) => f.nome))
      : new Set<string>();
    const novasFon = fontes.filter((f) => !jaFon.has(f.nome));
    if (novasFon.length) await tx.insert(fontesReceita).values(novasFon.map((f, i) => ({ empresaId, nome: f.nome, natureza: f.natureza, ordem: 20 + i })));
    await tx.insert(auditoria).values({ empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "empresa.trocar_pacote", entidade: "empresa", entidadeId: empresaId, dados: { de: ctx.empresa.perfil, para: perfil } });
  });
  revalidatePath(`/${empresaId}`, "layout");
  return { ok: `Pronto: agora o painel é de ${p.nome.toLowerCase()}.` };
}
