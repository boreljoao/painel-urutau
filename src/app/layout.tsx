import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const texto = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--fonte" });

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel" },
  description: "O painel de gestão da sua empresa: vendas, clientes, WhatsApp e financeiro num lugar só.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f1f2ef",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={texto.variable}>
      <body>{children}</body>
    </html>
  );
}
