"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/db";
import { etapaNegocioEnum, finalidadeImovelEnum, statusImovelEnum } from "@/db/schema";
import { dataValida, hoje } from "@/lib/datas";
import { lerPercentual, lerReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";
import { TIPOS_IMOVEL } from "@/lib/imobiliaria";
import {
  ErroImobiliaria,
  encerrarContrato,
  excluirImovel,
  fecharNegocio,
  moverNegocio,
  mudarStatusImovel,
  receberAluguel,
  repassarAluguel,
  salvarContrato,
  salvarImovel,
  salvarNegocio,
} from "@/lib/servidor/imobiliaria";
import { exigirPermissao } from "@/servidor/acesso";

/** Imobiliária no painel: os formulários chegam aqui, conferidos, e vão para o serviço do app. */

const erroDe = (e: unknown) => (e instanceof ErroImobiliaria ? e.message : "Não foi possível salvar. Tente de novo.");
const atualizar = (empresaId: string) => revalidatePath(`/${empresaId}`, "layout");
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const valoresDe = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));

/** "" → null; "abc" → undefined (inválido); "12" → 12. */
function inteiro(fd: FormData, k: string, max = 100_000) {
  const t = texto(fd, k).replace(/\./g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
}
function dinheiro(fd: FormData, k: string) {
  const t = texto(fd, k);
  if (!t) return null;
  const c = lerReais(t);
  return c != null && c >= 0 ? c : undefined;
}

// ─── Imóveis ─────────────────────────────────────────────────────────────────

export async function salvarImovelAcao(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = valoresDe(fd);
  const erros: Record<string, string> = {};
  const titulo = texto(fd, "titulo", 120);
  const codigo = texto(fd, "codigo", 20).toUpperCase();
  if (titulo.length < 3) erros.titulo = "Dê um título ao imóvel (ex.: Apartamento 3 quartos vista mar).";
  if (!codigo) erros.codigo = "Informe o código.";
  const tipo = texto(fd, "tipo");
  if (!(TIPOS_IMOVEL as readonly string[]).includes(tipo)) erros.tipo = "Escolha o tipo.";
  const finalidade = finalidadeImovelEnum.enumValues.find((f) => f === texto(fd, "finalidade")) ?? "venda";
  const nums = { areaM2: inteiro(fd, "areaM2", 1_000_000), quartos: inteiro(fd, "quartos", 50), suites: inteiro(fd, "suites", 50), banheiros: inteiro(fd, "banheiros", 50), vagas: inteiro(fd, "vagas", 50) };
  for (const [k, v] of Object.entries(nums)) if (v === undefined) erros[k] = "Use só números.";
  const precos = { precoVendaCentavos: dinheiro(fd, "precoVenda"), aluguelCentavos: dinheiro(fd, "aluguel"), condominioCentavos: dinheiro(fd, "condominio"), iptuCentavos: dinheiro(fd, "iptu") };
  const campoPreco: Record<string, string> = { precoVendaCentavos: "precoVenda", aluguelCentavos: "aluguel", condominioCentavos: "condominio", iptuCentavos: "iptu" };
  for (const [k, v] of Object.entries(precos)) if (v === undefined) erros[campoPreco[k]] = "Valor inválido. Exemplo: 450.000,00";
  if (finalidade !== "aluguel" && !precos.precoVendaCentavos && !erros.precoVenda) erros.precoVenda = "Informe o preço de venda.";
  if (finalidade !== "venda" && !precos.aluguelCentavos && !erros.aluguel) erros.aluguel = "Informe o valor do aluguel.";
  const comissaoPcm = texto(fd, "comissao") ? lerPercentual(texto(fd, "comissao")) : 6_000;
  if (comissaoPcm == null || comissaoPcm < 0 || comissaoPcm > 100_000) erros.comissao = "Porcentagem inválida. Exemplo: 6";
  const captadoEm = texto(fd, "captadoEm") || hoje();
  if (!dataValida(captadoEm)) erros.captadoEm = "Data inválida.";
  const proprietarioId = texto(fd, "proprietarioId") || null;
  if (proprietarioId && !z.uuid().safeParse(proprietarioId).success) erros.proprietarioId = "Proprietário inválido.";
  const fotos = texto(fd, "fotos", 4000)
    .split(/\s+/)
    .filter((u) => /^https:\/\/\S+$/.test(u))
    .slice(0, 20);
  const destaques = texto(fd, "destaques", 600)
    .split(/[,\n]/)
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (Object.keys(erros).length) return { erros, valores };
  try {
    await salvarImovel(obterDb(), empresaId, ctx.usuario.id, id, {
      codigo,
      titulo,
      tipo,
      finalidade,
      bairro: texto(fd, "bairro", 80),
      cidade: texto(fd, "cidade", 80),
      endereco: texto(fd, "endereco", 200),
      ...(nums as Record<keyof typeof nums, number | null>),
      ...(precos as Record<keyof typeof precos, number | null>),
      destaques,
      fotos,
      descricao: texto(fd, "descricao", 3000),
      proprietarioId,
      corretor: texto(fd, "corretor", 80),
      comissaoPcm: comissaoPcm!,
      exclusivo: fd.get("exclusivo") === "on",
      captadoEm,
    });
  } catch (e) {
    return { erros: { _: erroDe(e) }, valores };
  }
  atualizar(empresaId);
  return { ok: id ? "Imóvel atualizado." : "Imóvel na carteira.", valores };
}

export async function statusImovelAcao(empresaId: string, id: string, status: string): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const s = statusImovelEnum.enumValues.find((x) => x === status);
  if (!s) return { erro: "Situação inválida." };
  try {
    await mudarStatusImovel(obterDb(), empresaId, ctx.usuario.id, id, s);
  } catch (e) {
    return { erro: erroDe(e) };
  }
  atualizar(empresaId);
  return {};
}

export async function excluirImovelAcao(empresaId: string, id: string): Promise<{ erro?: string }> {
  await exigirPermissao(empresaId, "gerenciar");
  await excluirImovel(obterDb(), empresaId, id);
  atualizar(empresaId);
  return {};
}

// ─── Funil ───────────────────────────────────────────────────────────────────

export async function salvarNegocioAcao(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = valoresDe(fd);
  const erros: Record<string, string> = {};
  const clienteId = texto(fd, "clienteId");
  if (!z.uuid().safeParse(clienteId).success) erros.clienteId = "Escolha o cliente (ou cadastre em Clientes).";
  const imovelId = texto(fd, "imovelId") || null;
  if (imovelId && !z.uuid().safeParse(imovelId).success) erros.imovelId = "Imóvel inválido.";
  const valor = dinheiro(fd, "valor");
  if (valor === undefined) erros.valor = "Valor inválido.";
  const proximoEm = texto(fd, "proximoEm") || null;
  if (proximoEm && !dataValida(proximoEm)) erros.proximoEm = "Data inválida.";
  if (Object.keys(erros).length) return { erros, valores };
  try {
    await salvarNegocio(obterDb(), empresaId, ctx.usuario.id, id, {
      clienteId,
      imovelId,
      tipo: texto(fd, "tipo") === "locacao" ? "locacao" : "compra",
      valorCentavos: valor ?? null,
      origem: texto(fd, "origem", 40),
      corretor: texto(fd, "corretor", 80),
      procura: texto(fd, "procura", 600),
      proximoPasso: texto(fd, "proximoPasso", 200),
      proximoEm,
    });
  } catch (e) {
    return { erros: { _: erroDe(e) }, valores };
  }
  atualizar(empresaId);
  return { ok: id ? "Negócio atualizado." : "Negócio no funil.", valores };
}

export async function moverNegocioAcao(empresaId: string, id: string, etapa: string, motivo?: string): Promise<{ erro?: string }> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const e = etapaNegocioEnum.enumValues.find((x) => x === etapa && x !== "fechado");
  if (!e || e === "fechado") return { erro: "Etapa inválida." };
  try {
    await moverNegocio(obterDb(), empresaId, ctx.usuario.id, id, e, motivo ?? null);
  } catch (er) {
    return { erro: erroDe(er) };
  }
  atualizar(empresaId);
  return {};
}

export async function fecharNegocioAcao(empresaId: string, id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = valoresDe(fd);
  const valor = dinheiro(fd, "valor");
  const pcm = lerPercentual(texto(fd, "comissao"));
  const data = texto(fd, "data") || hoje();
  const erros: Record<string, string> = {};
  if (!valor) erros.valor = "Informe o valor fechado.";
  if (pcm == null || pcm < 0 || pcm > 100_000) erros.comissao = "Porcentagem inválida.";
  if (!dataValida(data) || data > hoje()) erros.data = "Data inválida.";
  if (Object.keys(erros).length) return { erros, valores };
  try {
    await fecharNegocio(obterDb(), empresaId, ctx.usuario.id, id, { valorCentavos: valor!, comissaoPcm: pcm!, data, recebido: fd.get("recebido") === "on" });
  } catch (e) {
    return { erros: { _: erroDe(e) }, valores };
  }
  atualizar(empresaId);
  return { ok: "Negócio fechado. A comissão está nas receitas.", valores };
}

// ─── Locação ─────────────────────────────────────────────────────────────────

export async function salvarContratoAcao(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = valoresDe(fd);
  const erros: Record<string, string> = {};
  const imovelId = texto(fd, "imovelId");
  const inquilinoId = texto(fd, "inquilinoId");
  const proprietarioId = texto(fd, "proprietarioId") || null;
  if (!z.uuid().safeParse(imovelId).success) erros.imovelId = "Escolha o imóvel.";
  if (!z.uuid().safeParse(inquilinoId).success) erros.inquilinoId = "Escolha o inquilino.";
  if (proprietarioId && !z.uuid().safeParse(proprietarioId).success) erros.proprietarioId = "Proprietário inválido.";
  const inicio = texto(fd, "inicio");
  const fim = texto(fd, "fim");
  if (!dataValida(inicio)) erros.inicio = "Data inválida.";
  if (!dataValida(fim)) erros.fim = "Data inválida.";
  const aluguel = dinheiro(fd, "aluguel");
  if (!aluguel) erros.aluguel = "Informe o aluguel.";
  const taxa = lerPercentual(texto(fd, "taxa") || "10");
  if (taxa == null || taxa < 0 || taxa > 100_000) erros.taxa = "Porcentagem inválida.";
  const dia = inteiro(fd, "dia", 28);
  if (!dia) erros.dia = "Dia entre 1 e 28.";
  if (Object.keys(erros).length) return { erros, valores };
  try {
    await salvarContrato(obterDb(), empresaId, ctx.usuario.id, {
      imovelId,
      inquilinoId,
      proprietarioId,
      inicio,
      fim,
      aluguelCentavos: aluguel!,
      taxaAdmPcm: taxa!,
      diaVencimento: dia!,
      indice: texto(fd, "indice", 20) || "IGP-M",
      garantia: texto(fd, "garantia", 60),
    });
  } catch (e) {
    return { erros: { _: erroDe(e) }, valores };
  }
  atualizar(empresaId);
  return { ok: "Contrato cadastrado. O imóvel está como alugado.", valores };
}

const acaoSimples = async (empresaId: string, f: (usuarioId: string) => Promise<unknown>): Promise<{ erro?: string }> => {
  const ctx = await exigirPermissao(empresaId, "lancar");
  try {
    await f(ctx.usuario.id);
  } catch (e) {
    return { erro: erroDe(e) };
  }
  atualizar(empresaId);
  return {};
};

export async function encerrarContratoAcao(empresaId: string, id: string) {
  return acaoSimples(empresaId, (u) => encerrarContrato(obterDb(), empresaId, u, id, hoje()));
}
export async function receberAluguelAcao(empresaId: string, id: string) {
  return acaoSimples(empresaId, (u) => receberAluguel(obterDb(), empresaId, u, id, hoje()));
}
export async function repassarAluguelAcao(empresaId: string, id: string) {
  return acaoSimples(empresaId, (u) => repassarAluguel(obterDb(), empresaId, u, id, hoje()));
}
