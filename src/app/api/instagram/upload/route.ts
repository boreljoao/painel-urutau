import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { exigirPermissao } from "@/servidor/acesso";

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
        await exigirPermissao(empresaId, "lancar");
        if (!pathname.startsWith(`instagram/${empresaId}/`)) throw new Error("Destino do arquivo inválido.");
        return { allowedContentTypes: TIPOS, maximumSizeInBytes: 300 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha no envio." }, { status: 400 });
  }
}
