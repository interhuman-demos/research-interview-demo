import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const research = await prisma.research.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      topic: true,
      status: true,
      includeOptions: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          prompt: true,
          helperText: true,
          maxSeconds: true,
        },
      },
    },
  });
  if (!research || research.status !== "live") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return NextResponse.json({ research });
}
