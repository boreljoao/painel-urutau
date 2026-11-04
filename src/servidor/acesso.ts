import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { obterDb } from "@/db";
import { empresaModulos, empresaUsuarios, empresas, type Empresa, type Modulo, type Papel } from "@/db/schema";
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
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const carregar = cache(async (empresaId: string): Promise<Contexto> => {
  const usuario = await exigirUsuario();
  if (!UUID.test(empresaId)) notFound();
  const db = obterDb();
  const [[empresa], [membro], escolhas] = await Promise.all([
    db.select().from(empresas).where(eq(empresas.id, empresaId)).limit(1),
    db
      .select({ papel: empresaUsuarios.papel })
      .from(empresaUsuarios)
      .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.usuarioId, usuario.id)))
      .limit(1),
    db.select({ modulo: empresaModulos.modulo, ativo: empresaModulos.ativo }).from(empresaModulos).where(eq(empresaModulos.empresaId, empresaId)),
  ]);
  // Empresa de outra pessoa responde igual a uma inexistente. A equipe Urutau entra em qualquer uma.
  if (!empresa || (!membro && !usuario.superadmin)) notFound();
  return { usuario, empresa, papel: membro?.papel ?? "dono", comoAdmin: !membro, modulos: modulosAtivos(empresa.perfil, escolhas) };
});

export const telaInicial = (empresaId: string, papel: Papel) => (papel === "colaborador" ? `/${empresaId}/vendas` : `/${empresaId}`);

/** Para páginas: sem permissão, volta para a tela inicial do papel. */
export async function exigirAcesso(empresaId: string, acao?: Acao) {
  const ctx = await carregar(empresaId);
  if (acao && !pode(ctx.papel, acao)) redirect(telaInicial(empresaId, ctx.papel));
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
        .select({ id: empresas.id, nome: empresas.nome, perfil: empresas.perfil, cidade: empresas.cidade })
        .from(empresas)
        .orderBy(asc(empresas.nome))
    ).map((e) => ({ ...e, papel: "dono" as Papel }));
  return obterDb()
    .select({ id: empresas.id, nome: empresas.nome, perfil: empresas.perfil, cidade: empresas.cidade, papel: empresaUsuarios.papel })
    .from(empresaUsuarios)
    .innerJoin(empresas, eq(empresas.id, empresaUsuarios.empresaId))
    .where(eq(empresaUsuarios.usuarioId, usuario.id))
    .orderBy(asc(empresas.nome));
}
