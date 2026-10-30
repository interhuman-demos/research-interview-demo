import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOpenAI, CHAT_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  message: z.string().min(1).max(4000),
});

const SYSTEM_PROMPT = `You are an expert qualitative-research interviewer helping a researcher set up a video research interview.

The researcher will share a topic. You should:
1. Ask one short clarifying question if the goal is unclear, otherwise propose a question set.
2. When proposing questions, return 5–10 open-ended, video-friendly questions (no yes/no, no multi-part). Order them from warm-up to deep.
3. Always respond as JSON with this shape:
{
  "reply": "<one short message to the researcher>",
  "proposed_questions": [
    { "prompt": "...", "helperText": "...", "maxSeconds": 90 }
  ]
}
Set "proposed_questions" to an empty array when you're still asking for clarification.

Avoid jargon. Each question should invite a short story or example. Default maxSeconds is 90.`;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const research = await prisma.research.findUnique({
    where: { id },
    include: { chatMessages: { orderBy: { createdAt: "asc" } } },
  });
  if (!research || research.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  await prisma.chatMessage.create({
    data: { researchId: id, role: "user", content: parsed.data.message },
  });

  const openai = getOpenAI();
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...(research.topic
      ? [
          {
            role: "system" as const,
            content: `Research topic: ${research.topic}`,
          },
        ]
      : []),
    ...research.chatMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: parsed.data.message },
  ];

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const content = completion.choices[0]?.message?.content ?? "{}";

  let parsedReply: {
    reply: string;
    proposed_questions: {
      prompt: string;
      helperText?: string;
      maxSeconds?: number;
    }[];
  };
  try {
    parsedReply = JSON.parse(content);
  } catch {
    parsedReply = { reply: content, proposed_questions: [] };
  }

  await prisma.chatMessage.create({
    data: { researchId: id, role: "assistant", content },
  });

  return NextResponse.json(parsedReply);
}
