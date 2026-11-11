import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { exigirPermissao } from "@/servidor/acesso";
import { bloqueioDaDemo, freio } from "@/servidor/freio";

/**
 * O celular manda fotos, vídeos e PDFs direto para o Vercel Blob (vídeo não passa pelo servidor,
 * que tem limite de 4,5 MB por requisição). Aqui só se confere quem pode e para onde vai.
 */
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "video/mp4", "video/quicktime", "application/pdf"];

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const resposta = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, payload) => {
        const { empresaId } = JSON.parse(payload ?? "{}") as { empresaId?: string };
        if (!empresaId) throw new Error("Empresa não informada.");
        const ctx = await exigirPermissao(empresaId, "lancar");
        const demo = bloqueioDaDemo(ctx.usuario);
        if (demo) throw new Error(demo);
        if (!pathname.startsWith(`instagram/${empresaId}/`)) throw new Error("Destino do arquivo inválido.");
        // Teto de envios por empresa por dia (armazenamento custa).
        if (!(await freio(`upload:empresa:${empresaId}`, 150, 24 * 60 * 60))) throw new Error("A empresa chegou ao limite de arquivos enviados hoje.");
        const video = /\.(mp4|mov)$/i.test(pathname);
        return { allowedContentTypes: TIPOS, maximumSizeInBytes: (video ? 200 : 25) * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha no envio." }, { status: 400 });
  }
}
