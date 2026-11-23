"use client";

/**
 * Alguém está mesmo olhando a tela? Aba visível e algum toque, tecla, rolagem ou movimento do mouse
 * nos últimos 10 minutos. Uma aba esquecida aberta no computador da recepção não precisa
 * perguntar nada ao servidor a noite toda (e manteria o banco ligado, pago por hora).
 */
export const PARADO_MS = 10 * 60_000;

let ultimaAtividade = Date.now();
const aoVoltar = new Set<() => void>();
let ouvindo = false;

function marcar() {
  const estavaParado = Date.now() - ultimaAtividade > PARADO_MS;
  ultimaAtividade = Date.now();
  if (estavaParado) aoVoltar.forEach((f) => f());
}

function ouvir() {
  if (ouvindo || typeof window === "undefined") return;
  ouvindo = true;
  for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"]) window.addEventListener(ev, marcar, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && marcar());
}

export function presente() {
  ouvir();
  return document.visibilityState === "visible" && Date.now() - ultimaAtividade <= PARADO_MS;
}

/** Avisa quando a pessoa volta depois de ficar parada (para atualizar na hora). Devolve o cancelamento. */
export function quandoVoltar(f: () => void) {
  ouvir();
  aoVoltar.add(f);
  return () => {
    aoVoltar.delete(f);
  };
}
