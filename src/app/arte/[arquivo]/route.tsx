import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { obterDb } from "@/db";
import { empresas, postsInstagram } from "@/db/schema";
import { corDoPerfil } from "@/servidor/marca";

/**
 * As artes do post (1080x1350, 4:5) nas cores do ramo da empresa: `<id>.png` é a capa e
 * `<id>-<n>.png` o slide n do carrossel. São públicas porque o Buffer precisa baixar; o endereço
 * leva o id do post, que não dá para adivinhar.
 */
export async function GET(_: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo } = await params;
  const m = /^([0-9a-f-]{36})(?:-(\d{1,2}))?\.png$/.exec(arquivo);
  if (!m) return new Response("não encontrada", { status: 404 });
  const [, id, num] = m;
  const n = Number(num ?? 0);
  const [p] = await obterDb()
    .select({ conteudo: postsInstagram.conteudo, nome: empresas.nome, perfil: empresas.perfil, cidade: empresas.cidade })
    .from(postsInstagram)
    .innerJoin(empresas, eq(empresas.id, postsInstagram.empresaId))
    .where(eq(postsInstagram.id, id));
  if (!p?.conteudo) return new Response("não encontrada", { status: 404 });
  const slides = p.conteudo.slides ?? [];
  if (n > slides.length) return new Response("não encontrada", { status: 404 });
  const { cor, clara } = corDoPerfil(p.perfil);
  const { titulo, subtitulo, selo } = p.conteudo.arte;
  const texto = n ? slides[n - 1] : titulo;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 96, background: "#16191d", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", padding: "14px 28px", borderRadius: 999, background: cor, color: "#ffffff", fontSize: 34, fontWeight: 700 }}>{selo}</div>
          {slides.length > 0 && <div style={{ display: "flex", fontSize: 32, color: "#8b9097" }}>{`${n + 1}/${slides.length + 1}`}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <div style={{ display: "flex", width: 120, height: 14, borderRadius: 7, background: clara }} />
          <div style={{ display: "flex", fontSize: texto.length > 40 ? 76 : texto.length > 28 ? 92 : 112, fontWeight: 800, lineHeight: 1.05, letterSpacing: -3 }}>{texto}</div>
          {!n && <div style={{ display: "flex", fontSize: 46, lineHeight: 1.3, color: "#c9cdd2" }}>{subtitulo}</div>}
          {n > 0 && n === slides.length && <div style={{ display: "flex", fontSize: 40, color: clara }}>Arraste para o lado e salve este post</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 34, color: "#8b9097" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 18, background: cor, color: "#ffffff", fontWeight: 800, fontSize: 36 }}>
              {p.nome[0]}
            </div>
            <div style={{ display: "flex", color: "#ffffff", fontWeight: 700 }}>{p.nome}</div>
          </div>
          {p.cidade && <div style={{ display: "flex" }}>{p.cidade}</div>}
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "cache-control": "public, max-age=300" } },
  );
}
