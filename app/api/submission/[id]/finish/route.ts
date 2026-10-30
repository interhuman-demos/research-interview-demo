import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { closeStreamSession } from "@/lib/interhuman/stream-relay";
import { generateSubmissionSummary } from "@/lib/summary/submission-summary";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      research: { include: { questions: { orderBy: { order: "asc" } } } },
      answers: true,
    },
  });
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.submission.update({
    where: { id },
    data: { status: "finished", finishedAt: new Date() },
  });
  if (submission.streamSessionId) {
    closeStreamSession(submission.streamSessionId);
  }

  // Fire-and-forget summary generation. The respondent doesn't wait.
  void generateSubmissionSummary(id).catch((err) => {
    console.error("Submission summary generation failed", err);
  });

  return NextResponse.json({ ok: true });
}
