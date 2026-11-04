const CAMINHOS = {
  inicio: "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z",
  vendas: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  clientes: "M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.4.8 2.3 2.4 2.6 4.6",
  whatsapp: "M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5Z",
  financeiro: "M3.5 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 10h17M15 14.5h2.5",
  despesas: "M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4 1.3-4 3s1.4 2.5 4 3 4 1.5 4 3.2-1.6 3.3-4.2 3.3c-2.1 0-3.7-.8-4.5-2.2",
  agenda: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 3v4M15 3v4",
  seta: "M5 12h14M13 6l6 6-6 6",
  check: "m5 12.5 4.5 4.5L19 7.5",
  alerta: "M12 4 3 19.5h18zM12 10v4.5M12 17.2v.1",
  busca: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20",
  enviar: "M4 12 20 4l-6 16-3-7z",
  voltar: "M19 12H5M11 6l-6 6 6 6",
  telefone: "M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z",
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, className = "" }: { nome: NomeIcone; className?: string }) {
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
