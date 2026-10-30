import { NextResponse } from "next/server";
import { get } from "@vercel/blob";

import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("u");
  if (!target) {
    return NextResponse.json({ error: "Missing u" }, { status: 400 });
  }

  const range = req.headers.get("range") ?? undefined;
  try {
    const result = await get(target, {
      access: "private",
      headers: range ? { range } : undefined,
    });
    if (!result || result.statusCode === 304 || !result.stream) {
      return new NextResponse(null, { status: 304 });
    }
    const headers = new Headers();
    headers.set(
      "content-type",
      result.headers.get("content-type") ?? result.blob.contentType ?? "video/webm",
    );
    const len = result.headers.get("content-length");
    if (len) headers.set("content-length", len);
    const cr = result.headers.get("content-range");
    if (cr) headers.set("content-range", cr);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, max-age=0, must-revalidate");
    const status = cr ? 206 : 200;
    return new NextResponse(result.stream, { status, headers });
  } catch (err) {
    console.error("[/api/blob] get failed", err);
    const message = err instanceof Error ? err.message : "Blob fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
