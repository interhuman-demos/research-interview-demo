import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const research = await prisma.research.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      chatMessages: { orderBy: { createdAt: "asc" } },
      _count: { select: { submissions: true } },
    },
  });
  if (!research || research.creatorId !== session.user.id) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <nav className="flex items-center justify-between text-sm">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={`/studio/${research.id}/submissions`}
            className="text-muted-foreground hover:text-foreground"
          >
            Submissions ({research._count.submissions})
          </Link>
          <Link
            href={`/studio/${research.id}/questions`}
            className="text-muted-foreground hover:text-foreground"
          >
            Question analysis
          </Link>
          <Link
            href={`/studio/${research.id}/summary`}
            className="text-muted-foreground hover:text-foreground"
          >
            Summary
          </Link>
        </div>
      </nav>

      <StudioWorkspace
        initialResearch={{
          id: research.id,
          slug: research.slug,
          title: research.title,
          topic: research.topic,
          status: research.status,
          questions: research.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            helperText: q.helperText,
            maxSeconds: q.maxSeconds,
          })),
          chatMessages: research.chatMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
        }}
      />
    </main>
  );
}
