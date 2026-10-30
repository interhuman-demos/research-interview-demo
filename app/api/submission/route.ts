import { NextResponse } from "next/server";
import { z } from "zod";
import { customAlphabet } from "nanoid";

import { prisma } from "@/lib/db";
import { createStreamSession } from "@/lib/interhuman/stream-relay";

export const runtime = "nodejs";

const tokenId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  32,
);

const Body = z.object({
  slug: z.string().min(1),
  nickname: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }
  const research = await prisma.research.findUnique({
    where: { slug: parsed.data.slug },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!research || research.status !== "live") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const apiKey = process.env.INTERHUMAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "INTERHUMAN_API_KEY is not set" },
      { status: 500 },
    );
  }

  const submission = await prisma.submission.create({
    data: {
      researchId: research.id,
      respondentNickname: parsed.data.nickname ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  });

  // Pre-create empty Answer rows so the client can PATCH them by questionId.
  await prisma.answer.createMany({
    data: research.questions.map((q) => ({
      submissionId: submission.id,
      questionId: q.id,
    })),
  });

  // Open one Interhuman stream session for the whole submission.
  const token = tokenId();
  const include = Array.isArray(research.includeOptions)
    ? (research.includeOptions as string[])
    : [];
  let streamSessionId: string;
  try {
    const stream = await createStreamSession({
      submissionId: submission.id,
      token,
      apiKey,
      config: include.length ? { include } : undefined,
    });
    streamSessionId = stream.id;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Upstream connection failed",
      },
      { status: 502 },
    );
  }

  await prisma.submission.update({
    where: { id: submission.id },
    data: { streamSessionId },
  });

  return NextResponse.json({
    submissionId: submission.id,
    streamSessionId,
    streamToken: token,
    questions: research.questions,
  });
}
