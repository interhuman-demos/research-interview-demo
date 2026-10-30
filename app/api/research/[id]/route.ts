import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const UpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    topic: z.string().max(4000).optional(),
    description: z.string().max(4000).optional(),
    status: z.enum(["draft", "live", "closed"]).optional(),
    questions: z
      .array(
        z.object({
          id: z.string().optional(),
          prompt: z.string().min(1).max(1000),
          helperText: z.string().max(1000).optional(),
          maxSeconds: z.number().int().min(10).max(600).optional(),
        }),
      )
      .optional(),
  })
  .strict();

async function ownedResearch(researchId: string, userId: string) {
  const r = await prisma.research.findUnique({ where: { id: researchId } });
  if (!r || r.creatorId !== userId) return null;
  return r;
}

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
    include: {
      questions: { orderBy: { order: "asc" } },
      chatMessages: { orderBy: { createdAt: "asc" } },
      _count: { select: { submissions: true } },
    },
  });
  if (!research || research.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ research });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const owned = await ownedResearch(id, session.user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { questions, ...researchPatch } = parsed.data;

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(researchPatch).length > 0) {
      await tx.research.update({ where: { id }, data: researchPatch });
    }
    if (questions) {
      // Replace the question list. Submissions pre-create empty Answer rows
      // per question, so we only protect questions that have a *recorded*
      // answer (blobUrl != null). For removed questions, we drop their empty
      // placeholder answers first, then delete the question.
      const existing = await tx.question.findMany({
        where: { researchId: id },
        include: {
          answers: {
            select: { id: true, blobUrl: true },
          },
        },
      });
      const incomingIds = new Set(
        questions.map((q) => q.id).filter((x): x is string => !!x),
      );
      const removed = existing.filter((q) => !incomingIds.has(q.id));
      const safeToDelete = removed.filter((q) =>
        q.answers.every((a) => a.blobUrl == null),
      );
      const blocked = removed.filter((q) =>
        q.answers.some((a) => a.blobUrl != null),
      );
      if (safeToDelete.length) {
        const placeholderAnswerIds = safeToDelete.flatMap((q) =>
          q.answers.map((a) => a.id),
        );
        if (placeholderAnswerIds.length) {
          await tx.answer.deleteMany({
            where: { id: { in: placeholderAnswerIds } },
          });
        }
        await tx.question.deleteMany({
          where: { id: { in: safeToDelete.map((q) => q.id) } },
        });
      }
      if (blocked.length) {
        throw new Error(
          `Cannot delete questions with recorded answers: ${blocked
            .map((q) => q.prompt.slice(0, 40))
            .join(", ")}`,
        );
      }
      // Sort updates by question id to enforce a stable lock order across
      // concurrent transactions and avoid Postgres deadlocks.
      const updates = questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.id && existing.some((e) => e.id === q.id))
        .sort((a, b) => (a.q.id! < b.q.id! ? -1 : 1));
      const inserts = questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => !q.id || !existing.some((e) => e.id === q.id));

      for (const { q, i } of updates) {
        await tx.question.update({
          where: { id: q.id! },
          data: {
            order: i,
            prompt: q.prompt,
            helperText: q.helperText ?? "",
            maxSeconds: q.maxSeconds ?? 90,
          },
        });
      }
      for (const { q, i } of inserts) {
        await tx.question.create({
          data: {
            researchId: id,
            order: i,
            prompt: q.prompt,
            helperText: q.helperText ?? "",
            maxSeconds: q.maxSeconds ?? 90,
          },
        });
      }
    }
    return tx.research.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not update research";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ research: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const owned = await ownedResearch(id, session.user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.research.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
