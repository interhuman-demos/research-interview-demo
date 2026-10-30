import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateSubmissionSummary } from "@/lib/summary/submission-summary";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { research: true },
  });
  if (!submission || submission.research.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await generateSubmissionSummary(id);
  return NextResponse.json(result);
}
