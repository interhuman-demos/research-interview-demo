import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateResearchSummary } from "@/lib/summary/research-summary";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const research = await prisma.research.findUnique({
    where: { id },
    include: { summary: true },
  });
  if (!research || research.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ summary: research.summary?.body ?? null });
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
  const research = await prisma.research.findUnique({ where: { id } });
  if (!research || research.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await generateResearchSummary(id);
  return NextResponse.json({ summary: body });
}
