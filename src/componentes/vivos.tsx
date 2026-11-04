"use client";

/**
 * As partes que se mexem: números que contam, o anel do ponto de equilíbrio, os gráficos que se
 * desenham e a entrada dos cartões. Tudo respeita "reduzir movimento" (aí só mostra o valor final).
 */
import { animate, stagger } from "motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icone, type NomeIcone } from "./Icone";
import { reais, reaisCurto } from "./formato";

interface ApiGraficos {
  line: (el: HTMLElement, o: Record<string, unknown>) => void;
  barList: (el: HTMLElement, linhas: { label: string; value: number }[], o?: Record<string, unknown>) => void;
  bars: (el: HTMLElement, o: Record<string, unknown>) => void;
}
// O charts.js mexe no document ao carregar: só pode entrar no navegador.
let carregando: Promise<unknown> | null = null;
async function graficos() {
  carregando ??= import("./charts.js");
  await carregando;
  return (window as unknown as { Charts: ApiGraficos }).Charts;
}
const EASE = [0.23, 1, 0.32, 1] as const;
const parado = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const FORMATOS = {
  reais: (v: number) => reais(v),
  curto: (v: number) => reaisCurto(v),
  inteiro: (v: number) => Math.round(v).toLocaleString("pt-BR"),
};

export function Contador({ valor, formato = "reais", className }: { valor: number; formato?: keyof typeof FORMATOS; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const f = FORMATOS[formato];
    if (parado()) return void (el.textContent = f(valor));
    const a = animate(0, valor, { duration: 0.9, ease: EASE, onUpdate: (v) => (el.textContent = f(Math.round(v))) });
    return () => a.stop();
  }, [valor, formato]);
  return (
    <span ref={ref} className={className}>
      {FORMATOS[formato](valor)}
    </span>
  );
}

/** Meio anel, como o da inspiração: quanto do necessário já entrou. */
export function Medidor({ fracao, rotulo }: { fracao: number; rotulo: string }) {
  const arco = useRef<SVGPathElement>(null);
  const v = Math.max(0, Math.min(1, fracao));
  useEffect(() => {
    if (parado() || !arco.current) return;
    animate(arco.current, { strokeDasharray: ["0 100", `${v * 100} 100`] }, { duration: 1.2, ease: EASE });
  }, [v]);
  return (
    <div className="medidor">
      <svg viewBox="0 0 200 112" role="img" aria-label={rotulo}>
        <path d="M16 100 A84 84 0 0 1 184 100" fill="none" stroke="var(--cor-clara)" strokeWidth="18" strokeLinecap="round" />
        <path ref={arco} d="M16 100 A84 84 0 0 1 184 100" fill="none" stroke="var(--cor)" strokeWidth="18" strokeLinecap="round" pathLength={100} strokeDasharray={`${v * 100} 100`} />
      </svg>
      <p className="medidor-valor">{rotulo}</p>
    </div>
  );
}

function desenhar(el: HTMLElement) {
  if (parado()) return;
  for (const p of el.querySelectorAll("path")) {
    const fill = p.getAttribute("fill");
    if (fill && fill !== "none") animate(p, { opacity: [0, 1] }, { duration: 0.8, delay: 0.35 });
    else {
      const L = p.getTotalLength();
      if (L < 40) continue;
      p.style.strokeDasharray = `${L}`;
      animate(p, { strokeDashoffset: [L, 0] }, { duration: 1.1, ease: EASE });
    }
  }
  const barras = [...el.querySelectorAll("rect")].filter((r) => Number(r.getAttribute("height")) > 2 && Number(r.getAttribute("width")) < 200);
  for (const b of barras) Object.assign(b.style, { transformBox: "fill-box", transformOrigin: "bottom" });
  if (barras.length) animate(barras, { transform: ["scaleY(0)", "scaleY(1)"] }, { duration: 0.6, delay: stagger(0.025), ease: EASE });
}

export interface PontoMes {
  rotulo: string;
  faturamento: number;
  despesas: number;
  lucro: number;
}

const SERIES = [
  ["faturamento", "Faturamento"],
  ["despesas", "Despesas"],
  ["lucro", "Lucro"],
] as const;

export function GraficoMeses({ titulo, pontos }: { titulo: string; pontos: PontoMes[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [serie, setSerie] = useState<(typeof SERIES)[number][0]>("faturamento");
  useEffect(() => {
    const el = ref.current!;
    const fmt = (v: number) => reaisCurto(v * 100);
    let vivo = true;
    graficos().then((Charts) => {
    if (!vivo) return;
    if (serie === "lucro")
      Charts.bars(el, { labels: pontos.map((p) => p.rotulo), values: pontos.map((p) => p.lucro / 100), format: (v: number) => reais(v * 100), tickFormat: (v: number) => fmt(v).replace("R$ ", ""), height: 260, highlight: pontos.length - 1 });
    else
      Charts.line(el, {
        labels: pontos.map((p) => p.rotulo),
        series: [{ name: SERIES.find((s) => s[0] === serie)![1], values: pontos.map((p) => p[serie] / 100) }],
        format: (v: number) => reais(v * 100),
        tickFormat: (v: number) => fmt(v).replace("R$ ", ""),
        fill: true,
        height: 260,
        endLabel: true,
      });
    desenhar(el);
    });
    return () => {
      vivo = false;
    };
  }, [pontos, serie]);
  return (
    <>
      <header className="cartao-topo">
        <h2>{titulo}</h2>
        <div className="alternar" role="group" aria-label="O que mostrar">
          {SERIES.map(([id, nome]) => (
            <button key={id} type="button" aria-pressed={serie === id} onClick={() => setSerie(id)}>
              {nome}
            </button>
          ))}
        </div>
      </header>
      <div ref={ref} className="grafico" />
    </>
  );
}

export function BarrasFontes({ linhas }: { linhas: { nome: string; valor: number; participacao: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    let vivo = true;
    graficos().then((Charts) => {
    if (!vivo) return;
    // A participação (soma exatamente 100%, calculada no app) vai junto do nome.
    Charts.barList(
      el,
      linhas.map((l) => ({ label: l.participacao ? `${l.nome} · ${l.participacao}` : l.nome, value: l.valor / 100 })),
      { format: (v: number) => reaisCurto(v * 100) },
    );
    if (!parado()) {
      const barras = [...el.querySelectorAll<HTMLElement>("rect, [style*='width']")];
      for (const b of barras) Object.assign(b.style, { transformOrigin: "left", transformBox: "fill-box" });
      if (barras.length) animate(barras, { transform: ["scaleX(0)", "scaleX(1)"] }, { duration: 0.7, delay: stagger(0.06), ease: EASE });
    }
    });
    return () => {
      vivo = false;
    };
  }, [linhas]);
  return <div ref={ref} />;
}

/** Os cartões entram em sequência quando a tela abre. */
export function Entrada({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (parado()) return;
    const alvos = ref.current!.querySelectorAll(":scope > *");
    animate(alvos, { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0)"] }, { duration: 0.5, delay: stagger(0.045), ease: EASE });
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Um botão que grava algo (conferir, paguei, recebi…), tira a linha da lista e atualiza a tela. */
export function BotaoAcao({ acao, rotulo, icone = "check", classe = "botao-pequeno", sumir = true }: { acao: () => Promise<{ erro?: string } | void>; rotulo: string; icone?: NomeIcone | null; classe?: string; sumir?: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const router = useRouter();
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={botao}
        type="button"
        className={classe}
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await acao();
            if (r?.erro) return setErro(r.erro);
            const linha = sumir ? botao.current?.closest("li, tr") : null;
            if (linha && !parado()) await animate(linha, { opacity: 0, transform: "translateX(24px)" }, { duration: 0.3, ease: EASE });
            router.refresh();
          })
        }
      >
        {icone && <Icone nome={icone} />}
        <span>{pendente ? "…" : rotulo}</span>
      </button>
      {erro && (
        <span role="alert" className="erro-pequeno">
          {erro}
        </span>
      )}
    </>
  );
}

export const BotaoConferir = ({ acao }: { acao: () => Promise<{ erro?: string } | void> }) => <BotaoAcao acao={acao} rotulo="Conferir" />;

/** Telas que mudam sozinhas (o WhatsApp): busca de novo a cada tantos segundos, só com a aba visível. */
export function AtualizarSozinho({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}

/** Barras por dia (ou por categoria): quanto entrou em cada um. */
export function GraficoBarras({ rotulos, valores, destaque }: { rotulos: string[]; valores: number[]; destaque?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    let vivo = true;
    graficos().then((Charts) => {
      if (!vivo) return;
      Charts.bars(el, {
        labels: rotulos,
        values: valores.map((v) => v / 100),
        format: (v: number) => reais(v * 100),
        tickFormat: (v: number) => reaisCurto(v * 100).replace("R$ ", ""),
        height: 220,
        highlight: destaque,
      });
      desenhar(el);
    });
    return () => {
      vivo = false;
    };
  }, [rotulos, valores, destaque]);
  return <div ref={ref} className="grafico" />;
}

/** Lista de barras horizontais (categorias de despesa, fontes…). */
export function BarrasLista({ linhas }: { linhas: { nome: string; valor: number }[] }) {
  return <BarrasFontes linhas={linhas.map((l) => ({ ...l, participacao: "" }))} />;
}
