import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getStreamSession } from "@/lib/interhuman/stream-relay";

export const runtime = "nodejs";

const PatchBody = z.object({
  blobUrl: z.string().url(),
  durationMs: z.number().int().positive(),
  streamSessionId: z.string().optional(),
  streamToken: z.string().optional(),
  streamStartSeconds: z.number().nonnegative().optional(),
  streamEndSeconds: z.number().nonnegative().optional(),
  transcript: z.string().nullable().optional(),
  transcriptSegments: z.unknown().nullable().optional(),
  // Live envelopes captured client-side during recording. We also fold in any
  // events the relay buffered for this stream session window so we don't miss
  // any envelopes that arrived between the last SSE flush and stop.
  liveEnvelopes: z.array(z.unknown()).optional(),
});

interface RawEnvelope {
  type?: string;
  data?: { start?: number; end?: number };
}

function isInWindow(
  envelope: RawEnvelope,
  startS: number | undefined,
  endS: number | undefined,
): boolean {
  if (startS === undefined || endS === undefined) return true;
  const s = envelope?.data?.start;
  const e = envelope?.data?.end;
  if (typeof s !== "number" || typeof e !== "number") return true;
  return e >= startS && s <= endS;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const answer = await prisma.answer.findUnique({
    where: { id },
    include: { submission: true },
  });
  if (!answer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Authorize via stream token (respondent has no login).
  const sid = parsed.data.streamSessionId ?? answer.submission.streamSessionId;
  if (sid) {
    const stream = getStreamSession(sid);
    if (!stream) {
      // Session may have expired; still allow update if a token was supplied
      // (the buffer is gone but we have what the client captured).
    } else if (
      !parsed.data.streamToken ||
      parsed.data.streamToken !== stream.token
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const live = (parsed.data.liveEnvelopes ?? []) as RawEnvelope[];
  let buffered: RawEnvelope[] = [];
  if (sid) {
    const stream = getStreamSession(sid);
    if (stream) {
      buffered = stream.buffer
        .map((s) => {
          try {
            return JSON.parse(s) as RawEnvelope;
          } catch {
            return null;
          }
        })
        .filter((x): x is RawEnvelope => !!x);
    }
  }
  const all = [...live, ...buffered];

  const inWindow = all.filter((e) =>
    isInWindow(e, parsed.data.streamStartSeconds, parsed.data.streamEndSeconds),
  );
  const signals = inWindow.filter((e) => e.type === "signal.detected");
  const engagement = inWindow.filter((e) => e.type === "engagement.updated");
  const conversationQuality = inWindow.filter(
    (e) => e.type === "conversation_quality.updated",
  );

  console.info("[answer-patch] envelopes", {
    answerId: id,
    sessionId: sid,
    live: live.length,
    buffered: buffered.length,
    total: all.length,
    inWindow: inWindow.length,
    signals: signals.length,
    engagement: engagement.length,
    conversationQuality: conversationQuality.length,
    window: [parsed.data.streamStartSeconds, parsed.data.streamEndSeconds],
  });

  const updated = await prisma.answer.update({
    where: { id },
    data: {
      blobUrl: parsed.data.blobUrl,
      durationMs: parsed.data.durationMs,
      streamSessionId: sid ?? null,
      streamStartSeconds: parsed.data.streamStartSeconds ?? null,
      streamEndSeconds: parsed.data.streamEndSeconds ?? null,
      transcript: parsed.data.transcript ?? null,
      transcriptSegments:
        (parsed.data.transcriptSegments as object | undefined) ?? undefined,
      signals: signals as object,
      engagement: engagement as object,
      conversationQuality: conversationQuality as object,
      correlationId: getStreamSession(sid ?? "")?.correlationId ?? null,
    },
  });
  return NextResponse.json({ answer: updated });
}
