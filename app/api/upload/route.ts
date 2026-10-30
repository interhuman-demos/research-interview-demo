import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES = new Set(["video/webm", "video/mp4"]);
const MAX_BYTES = 64 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN is not set. Connect a Vercel Blob store to this project and redeploy.",
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const pathname = url.searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
  }

  const rawContentType = request.headers.get("content-type") ?? "video/webm";
  const baseType = rawContentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(baseType)) {
    return NextResponse.json(
      { error: `Unsupported content-type: ${rawContentType}` },
      { status: 415 },
    );
  }
  const contentType = baseType;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength && contentLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  try {
    const result = await put(pathname, body, {
      access: "private",
      contentType,
      addRandomSuffix: true,
    });
    return NextResponse.json({
      url: result.url,
      pathname: result.pathname,
      downloadUrl: result.downloadUrl,
    });
  } catch (err) {
    console.error("[/api/upload] put failed", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
