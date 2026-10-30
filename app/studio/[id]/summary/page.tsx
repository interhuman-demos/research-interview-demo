import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getPerQuestionAnalysis } from "@/lib/analysis/per-question";
import { prisma } from "@/lib/db";
import { ResearchSummaryView } from "@/components/submission/research-summary-view";

export const dynamic = "force-dynamic";

export default async function ResearchSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const research = await prisma.research.findUnique({
    where: { id },
    include: { summary: true, _count: { select: { submissions: true } } },
  });
  if (!research || research.creatorId !== session.user.id) notFound();

  const analysis = await getPerQuestionAnalysis(id);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <nav className="flex items-center justify-between text-sm">
        <Link
          href={`/studio/${id}`}
          className="text-muted-foreground hover:text-foreground"
        >
          ← {research.title}
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={`/studio/${id}/submissions`}
            className="text-muted-foreground hover:text-foreground"
          >
            Submissions
          </Link>
          <Link
            href={`/studio/${id}/questions`}
            className="text-muted-foreground hover:text-foreground"
          >
            Question analysis
          </Link>
        </div>
      </nav>
      <ResearchSummaryView
        researchId={research.id}
        title={research.title}
        submissionCount={research._count.submissions}
        initialSummary={research.summary?.body as object | null}
        generatedAt={research.summary?.generatedAt ?? null}
        analysis={analysis}
      />
    </main>
  );
}
