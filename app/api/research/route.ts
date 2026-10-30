import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const slugId = customAlphabet(
  "abcdefghijkmnopqrstuvwxyz23456789",
  10,
);

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  topic: z.string().max(2000).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await prisma.research.findMany({
    where: { creatorId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { submissions: true, questions: true } } },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const research = await prisma.research.create({
    data: {
      slug: slugId(),
      title: parsed.data.title,
      topic: parsed.data.topic ?? "",
      creatorId: session.user.id,
    },
  });
  return NextResponse.json({ research });
}
