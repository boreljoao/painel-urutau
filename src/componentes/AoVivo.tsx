"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Mantém a tela em dia sem recarregar: pergunta o "pulso" da empresa e, quando muda, pede ao
 * servidor só a tela nova (router.refresh mantém a rolagem e o que está aberto). Os itens com
 * `data-vivo="<id>:<versão>"` que mudaram ganham um destaque rápido.
 *
 * Mostra "Ao vivo" enquanto a conexão responde; se cair, o horário da última atualização.
 */
export function AoVivo({ pulso, intervalo = 8000, rotulo = "Ao vivo" }: { pulso: () => Promise<string>; intervalo?: number; rotulo?: string }) {
  const router = useRouter();
  const ultimo = useRef<string | null>(null);
  const [online, setOnline] = useState(true);
  const [em, setEm] = useState(() => new Date());
  const versoes = useRef<Map<string, string>>(new Map());

  // Guarda as versões dos itens na tela; os que mudarem depois de um refresh piscam.
  useEffect(() => {
    const ler = () => {
      const agora = new Map<string, string>();
      document.querySelectorAll<HTMLElement>("[data-vivo]").forEach((el) => {
        const [id, versao] = (el.dataset.vivo ?? "").split(":");
        if (!id) return;
        const antes = versoes.current.get(id);
        if (versoes.current.size && antes !== versao) {
          el.classList.remove("vivo-mudou");
          void el.offsetWidth;
          el.classList.add("vivo-mudou");
        }
        agora.set(id, versao ?? "");
      });
      versoes.current = agora;
    };
    ler();
    const obs = new MutationObserver(() => ler());
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-vivo"], childList: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let parado = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const p = await pulso();
        if (parado) return;
        setOnline(true);
        setEm(new Date());
        if (ultimo.current !== null && p !== ultimo.current) router.refresh();
        ultimo.current = p;
      } catch {
        if (!parado) setOnline(false);
      }
    };
    tick();
    const t = setInterval(tick, intervalo);
    const voltar = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", voltar);
    window.addEventListener("online", voltar);
    return () => {
      parado = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", voltar);
      window.removeEventListener("online", voltar);
    };
  }, [pulso, intervalo, router]);

  const hora = em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <span className={`ao-vivo ${online ? "ligado" : "caiu"}`} role="status" aria-live="polite">
      <span className="ao-vivo-ponto" aria-hidden />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={online ? "on" : "off"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          {online ? rotulo : `Atualizado às ${hora}`}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A linha da hora atual na grade da agenda, que anda sozinha a cada meio minuto. */
export function LinhaAgora({ inicioMin, fimMin, pxMin, mostrarHora = false }: { inicioMin: number; fimMin: number; pxMin: number; mostrarHora?: boolean }) {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const ler = () => {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      const [h, m] = p.split(":").map(Number);
      setAgora(h * 60 + m);
    };
    ler();
    const t = setInterval(ler, 30_000);
    return () => clearInterval(t);
  }, []);
  if (agora == null || agora < inicioMin || agora > fimMin) return null;
  const h = `${String(Math.floor(agora / 60)).padStart(2, "0")}:${String(agora % 60).padStart(2, "0")}`;
  return (
    <span className="semana-agora" style={{ top: `${(agora - inicioMin) * pxMin}px` }} aria-hidden>
      {mostrarHora && <b className="semana-agora-hora">{h}</b>}
    </span>
  );
}
