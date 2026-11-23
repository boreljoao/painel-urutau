"use server";

import { redirect } from "next/navigation";
import type { Perfil } from "@/db/schema";
import { hoje, mesAtual, somarMeses } from "@/lib/datas";
import { encerrarSessao, iniciarSessao, obterUsuarioAtual } from "@/lib/servidor/auth";
import { ehDemo } from "@/lib/demo";
import { RAMOS_DEMO, criarDemo, demoAberta, limparDemos } from "@/servidor/demo";
import { freio, freioPorIp } from "@/servidor/freio";

/** Abre um painel de exemplo do ramo: conta de visitante nova, com dados de alguns meses. */
export async function abrirDemo(perfil: Perfil) {
  if (!RAMOS_DEMO.includes(perfil)) redirect("/demo");
  // Já está num exemplo desse ramo: reabre o mesmo, sem criar outro nem gastar o limite.
  const atual = await obterUsuarioAtual();
  if (atual && ehDemo(atual.email)) {
    const aberta = await demoAberta(atual.id, perfil);
    if (aberta) redirect(destino(perfil, aberta));
  }
  // Cada demonstração cria conta e empresa de verdade no banco: freio por IP e teto do dia.
  // 20 por hora: numa apresentação de vendas a mesma rede abre vários ramos seguidos.
  // ("demo-v2": contador novo, o antigo somava os cliques recusados e travou quem insistiu.)
  if (!(await freioPorIp("demo-v2", 20, 60 * 60)) || !(await freio("demo:total", 400, 24 * 60 * 60))) redirect("/demo?limite=1");
  // Quem estava numa conta sai dela: a demonstração é outra conta.
  if (atual) await encerrarSessao();
  try {
    await limparDemos();
  } catch (e) {
    // A limpeza não pode impedir ninguém de ver a demonstração.
    console.error("limparDemos falhou:", e);
  }
  const { usuarioId, empresaId } = await criarDemo(perfil);
  await iniciarSessao(usuarioId);
  redirect(destino(perfil, empresaId));
}

function destino(perfil: Perfil, empresaId: string) {
  // No começo do mês os números ainda são poucos: o exemplo abre no último mês fechado.
  // Consultório abre na agenda; os outros ramos, na Visão geral.
  if (perfil === "consultorio") return `/${empresaId}/agenda`;
  // A loja abre na operação do dia (vendas de hoje, caixa, estoque); a imobiliária, no mês corrente.
  if (perfil === "varejo" || perfil === "imobiliaria") return `/${empresaId}`;
  return Number(hoje().slice(8)) < 15 ? `/${empresaId}?mes=${somarMeses(mesAtual(), -1)}` : `/${empresaId}`;
}
