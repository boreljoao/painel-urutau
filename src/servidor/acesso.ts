import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { obterDb } from "@/db";
import { type ConfigPainel, empresaModulos, empresaPainel, empresaUsuarios, empresas, type Empresa, type Modulo, type Papel, type Perfil } from "@/db/schema";
import { rotaInicial } from "@/lib/navegacao";
import { modulosAtivos } from "@/lib/perfis";
import { type Acao, pode } from "@/lib/permissoes";
import { exigirUsuario, type UsuarioAtual } from "@/lib/servidor/auth";

/**
 * As mesmas regras do app urutau (src/lib/servidor/acesso.ts), com os endereços deste painel:
 * aqui a empresa fica em /<empresaId>, sem o /e/ do app.
 */
export interface Contexto {
  usuario: UsuarioAtual;
  empresa: Empresa;
  papel: Papel;
  comoAdmin: boolean;
  modulos: Set<Modulo>;
  /** O que a empresa mudou no painel (menu, tela inicial, especialidade, meta). */
  config: ConfigPainel | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const carregar = cache(async (empresaId: string): Promise<Contexto> => {
  const usuario = await exigirUsuario();
  if (!UUID.test(empresaId)) notFound();
  const db = obterDb();
  const [[empresa], [membro], escolhas, [config]] = await Promise.all([
    db.select().from(empresas).where(eq(empresas.id, empresaId)).limit(1),
    db
      .select({ papel: empresaUsuarios.papel })
      .from(empresaUsuarios)
      .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.usuarioId, usuario.id)))
      .limit(1),
    db.select({ modulo: empresaModulos.modulo, ativo: empresaModulos.ativo }).from(empresaModulos).where(eq(empresaModulos.empresaId, empresaId)),
    db.select().from(empresaPainel).where(eq(empresaPainel.empresaId, empresaId)).limit(1),
  ]);
  // Empresa de outra pessoa responde igual a uma inexistente. A equipe Urutau entra em qualquer uma.
  if (!empresa || (!membro && !usuario.superadmin)) notFound();
  return { usuario, empresa, papel: membro?.papel ?? "dono", comoAdmin: !membro, modulos: modulosAtivos(empresa.perfil, escolhas), config: config ?? null };
});

/** Para onde a pessoa vai ao entrar: a tela inicial que a empresa escolheu, ou a do ramo. */
export const telaInicial = (empresaId: string, papel: Papel, perfil?: Perfil, config?: Pick<ConfigPainel, "telaInicial" | "menu"> | null, modulos?: Set<Modulo>) =>
  perfil ? rotaInicial(empresaId, papel, perfil, config, modulos) : papel === "colaborador" ? `/${empresaId}/vendas` : `/${empresaId}`;

/** Para páginas: sem permissão, volta para a tela inicial do papel. */
export async function exigirAcesso(empresaId: string, acao?: Acao) {
  const ctx = await carregar(empresaId);
  if (acao && !pode(ctx.papel, acao)) redirect(telaInicial(empresaId, ctx.papel, ctx.empresa.perfil, ctx.config, ctx.modulos));
  return ctx;
}

/** Para ações: sem permissão, lança erro e não grava nada. */
export async function exigirPermissao(empresaId: string, acao: Acao) {
  const ctx = await carregar(empresaId);
  if (!pode(ctx.papel, acao)) throw new Error("Você não tem permissão para esta ação.");
  return ctx;
}

/** As empresas da pessoa. A equipe Urutau vê todas (entra como dono, para dar suporte). */
export async function empresasDoUsuario(usuario: UsuarioAtual) {
  if (usuario.superadmin)
    return (
      await obterDb()
        .select({ id: empresas.id, nome: empresas.nome, perfil: empresas.perfil, cidade: empresas.cidade, telaInicial: empresaPainel.telaInicial, menu: empresaPainel.menu })
        .from(empresas)
        .leftJoin(empresaPainel, eq(empresaPainel.empresaId, empresas.id))
        .orderBy(asc(empresas.nome))
    ).map((e) => ({ ...e, papel: "dono" as Papel }));
  return obterDb()
    .select({ id: empresas.id, nome: empresas.nome, perfil: empresas.perfil, cidade: empresas.cidade, papel: empresaUsuarios.papel, telaInicial: empresaPainel.telaInicial, menu: empresaPainel.menu })
    .from(empresaUsuarios)
    .innerJoin(empresas, eq(empresas.id, empresaUsuarios.empresaId))
    .leftJoin(empresaPainel, eq(empresaPainel.empresaId, empresas.id))
    .where(eq(empresaUsuarios.usuarioId, usuario.id))
    .orderBy(asc(empresas.nome));
}
