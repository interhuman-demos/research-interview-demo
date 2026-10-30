import { NextResponse } from "next/server";
import { get } from "@vercel/blob";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ANALYZE_MAX_BYTES,
  AnalyzeTooLargeError,
  analyzeVideoBuffer,
} from "@/lib/interhuman/analyze-video";
import type { IncludeFlag } from "@/lib/interhuman/types";

export const runtime = "nodejs";
export const maxDuration = 300;

async function streamToArrayBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > ANALYZE_MAX_BYTES + 1) {
        // Bail out early — analyze endpoint will reject anyway.
        reader.cancel().catch(() => {});
        throw new AnalyzeTooLargeError(total);
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const answer = await prisma.answer.findUnique({
    where: { id },
    include: {
      submission: { include: { research: true } },
    },
  });
  if (!answer || answer.submission.research.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!answer.blobUrl) {
    return NextResponse.json(
      { error: "No recording on this answer" },
      { status: 400 },
    );
  }

  // Pull the stored blob.
  const result = await get(answer.blobUrl, { access: "private" });
  if (!result?.stream) {
    return NextResponse.json(
      { error: "Could not fetch stored video" },
      { status: 500 },
    );
  }
  const contentType =
    result.headers.get("content-type") ??
    result.blob.contentType ??
    "video/webm";

  let buffer: ArrayBuffer;
  try {
    buffer = await streamToArrayBuffer(result.stream);
  } catch (err) {
    if (err instanceof AnalyzeTooLargeError) {
      return NextResponse.json(
        { error: err.message, tooLarge: true },
        { status: 413 },
      );
    }
    throw err;
  }

  const includeRaw = answer.submission.research.includeOptions;
  const include: IncludeFlag[] = Array.isArray(includeRaw)
    ? (includeRaw as IncludeFlag[])
    : [];

  let envelopes;
  try {
    envelopes = await analyzeVideoBuffer(buffer, contentType, include);
  } catch (err) {
    if (err instanceof AnalyzeTooLargeError) {
      return NextResponse.json(
        { error: err.message, tooLarge: true },
        { status: 413 },
      );
    }
    console.error("[reanalyze] failed", { answerId: id, err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analyze failed" },
      { status: 502 },
    );
  }

  const updated = await prisma.answer.update({
    where: { id },
    data: {
      signals: envelopes.signals as object,
      engagement: envelopes.engagement as object,
      conversationQuality: envelopes.conversationQuality as object,
      // Clear any stale per-answer summary so the next regenerate uses fresh data.
      summary: undefined,
      streamStartSeconds: 0,
      streamEndSeconds: (answer.durationMs ?? 0) / 1000,
    },
  });

  console.info("[reanalyze] success", {
    answerId: id,
    signals: envelopes.signals.length,
    engagement: envelopes.engagement.length,
    quality: envelopes.conversationQuality.length,
  });

  return NextResponse.json({
    answerId: updated.id,
    counts: {
      signals: envelopes.signals.length,
      engagement: envelopes.engagement.length,
      conversationQuality: envelopes.conversationQuality.length,
    },
  });
}
