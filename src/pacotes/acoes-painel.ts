"use server";

import { revalidatePath } from "next/cache";
import { obterDb } from "@/db";
import { type ItemMenuEmpresa, empresaPainel } from "@/db/schema";
import { especialidadeValida, itensDoRamo } from "@/lib/navegacao";
import { registrarAuditoria } from "@/lib/servidor/auditoria";
import { exigirPermissao } from "@/servidor/acesso";

export interface FormConfigPainel {
  telaInicial: string;
  especialidade: string;
  /** Em reais, como a pessoa digitou ("400.000", "400000,00"); vazio tira a meta. */
  meta: string;
  menu: ItemMenuEmpresa[];
}

const paraCentavos = (texto: string) => {
  const limpo = texto.replace(/[^\d,]/g, "").replace(",", ".");
  if (!limpo) return null;
  const v = Math.round(Number(limpo) * 100);
  return Number.isFinite(v) && v > 0 ? v : NaN;
};

/** Tela inicial, ordem e nomes do menu, itens escondidos, especialidade e meta da empresa. */
export async function salvarConfigPainel(empresaId: string, f: FormConfigPainel): Promise<{ erro?: string; ok?: string }> {
  const ctx = await exigirPermissao(empresaId, "gerenciar");
  const ramo = itensDoRamo({ perfil: ctx.empresa.perfil, papel: "dono", modulos: ctx.modulos });
  const ids = new Set(ramo.map((i) => i.id));
  const menu = f.menu
    .filter((i) => ids.has(i.id))
    .map((i) => ({ id: i.id, ...(i.nome?.trim() ? { nome: i.nome.trim().slice(0, 40) } : {}), ...(i.oculto ? { oculto: true } : {}) }));
  if (menu.some((i) => i.oculto && i.id === f.telaInicial)) return { erro: "A tela inicial não pode estar escondida no menu." };
  if (!menu.some((i) => !i.oculto)) return { erro: "Deixe pelo menos um item visível no menu." };
  const telaInicial = f.telaInicial === "inicio" || ids.has(f.telaInicial) ? f.telaInicial : null;
  const metaCentavos = paraCentavos(f.meta);
  if (Number.isNaN(metaCentavos)) return { erro: "Meta inválida. Use só números, como 50.000." };
  const valores = {
    telaInicial,
    menu,
    especialidade: especialidadeValida(f.especialidade) ? f.especialidade : null,
    metaCentavos,
    atualizadoEm: new Date(),
  };
  const db = obterDb();
  await db.insert(empresaPainel).values({ empresaId, ...valores }).onConflictDoUpdate({ target: empresaPainel.empresaId, set: valores });
  await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: "usuario", acao: "empresa.configurar_painel", entidade: "empresa", entidadeId: empresaId });
  revalidatePath(`/${empresaId}`, "layout");
  return { ok: "Painel salvo. O menu já mudou." };
}
