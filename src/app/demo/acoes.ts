"use server";

import { redirect } from "next/navigation";
import type { Perfil } from "@/db/schema";
import { hoje, mesAtual, somarMeses } from "@/lib/datas";
import { encerrarSessao, iniciarSessao, obterUsuarioAtual } from "@/lib/servidor/auth";
import { RAMOS_DEMO, criarDemo, limparDemos } from "@/servidor/demo";
import { freio, freioPorIp } from "@/servidor/freio";

/** Abre um painel de exemplo do ramo: conta de visitante nova, com dados de alguns meses. */
export async function abrirDemo(perfil: Perfil) {
  if (!RAMOS_DEMO.includes(perfil)) redirect("/demo");
  // Cada demonstração cria conta e empresa de verdade no banco: freio por IP e teto do dia.
  if (!(await freioPorIp("demo", 8, 60 * 60)) || !(await freio("demo:total", 400, 24 * 60 * 60))) redirect("/demo?limite=1");
  // Quem estava numa conta sai dela: a demonstração é outra conta.
  if (await obterUsuarioAtual()) await encerrarSessao();
  try {
    await limparDemos();
  } catch (e) {
    // A limpeza não pode impedir ninguém de ver a demonstração.
    console.error("limparDemos falhou:", e);
  }
  const { usuarioId, empresaId } = await criarDemo(perfil);
  await iniciarSessao(usuarioId);
  // No começo do mês os números ainda são poucos: o exemplo abre no último mês fechado.
  // Consultório abre na agenda; os outros ramos, na Visão geral.
  if (perfil === "consultorio") redirect(`/${empresaId}/agenda`);
  // A loja abre na operação do dia (vendas de hoje, caixa, estoque).
  if (perfil === "varejo") redirect(`/${empresaId}`);
  redirect(Number(hoje().slice(8)) < 15 ? `/${empresaId}?mes=${somarMeses(mesAtual(), -1)}` : `/${empresaId}`);
}
