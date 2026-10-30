import { NextResponse } from "next/server";

import { getOpenAI, WHISPER_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";

  let url: string | null = null;
  let file: File | null = null;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { url?: string } | null;
    url = body?.url ?? null;
  } else if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    const u = form.get("url");
    if (typeof u === "string") url = u;
  }

  if (!file && url) {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch blob: ${res.status}` },
        { status: 400 },
      );
    }
    const buf = await res.arrayBuffer();
    const ext = url.split(".").pop()?.split("?")[0] ?? "webm";
    file = new File([buf], `audio.${ext}`, {
      type: res.headers.get("content-type") ?? "video/webm",
    });
  }

  if (!file) {
    return NextResponse.json(
      { error: "Provide a multipart `file` or JSON `{ url }`" },
      { status: 400 },
    );
  }

  try {
    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });
    return NextResponse.json(transcription);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
