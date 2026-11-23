"use client";

import { useEffect } from "react";

/** Tira o "?limite=1" do endereço depois de mostrar o aviso: recarregar a página não repete um bloqueio que já passou. */
export function LimparEndereco() {
  useEffect(() => {
    window.history.replaceState(null, "", "/demo");
  }, []);
  return null;
}
