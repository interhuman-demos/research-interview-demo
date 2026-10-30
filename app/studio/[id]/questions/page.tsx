import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { QuestionAnalysisView } from "@/components/studio/question-analysis-view";
import { auth } from "@/lib/auth";
import { getPerQuestionAnalysis } from "@/lib/analysis/per-question";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function QuestionAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const research = await prisma.research.findUnique({ where: { id } });
  if (!research || research.creatorId !== session.user.id) notFound();

  const analysis = await getPerQuestionAnalysis(id);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
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
            href={`/studio/${id}/summary`}
            className="text-muted-foreground hover:text-foreground"
          >
            Summary
          </Link>
        </div>
      </nav>

      <header className="mt-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Question analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{research.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dominant Interhuman signal per question, with cue-level drill-in.
        </p>
      </header>

      <QuestionAnalysisView analysis={analysis} />
    </main>
  );
}
