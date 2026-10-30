import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SubmissionDetail } from "@/components/submission/submission-detail";

export const dynamic = "force-dynamic";

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string; subId: string }>;
}) {
  const { id, subId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const submission = await prisma.submission.findUnique({
    where: { id: subId },
    include: {
      research: true,
      answers: {
        include: { question: true },
        orderBy: { question: { order: "asc" } },
      },
    },
  });
  if (
    !submission ||
    submission.researchId !== id ||
    submission.research.creatorId !== session.user.id
  ) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <nav className="text-sm">
        <Link
          href={`/studio/${id}/submissions`}
          className="text-muted-foreground hover:text-foreground"
        >
          ← Submissions
        </Link>
      </nav>
      <SubmissionDetail
        submissionId={submission.id}
        respondent={submission.respondentNickname ?? "Anonymous"}
        status={submission.status}
        summary={submission.summary as object | null}
        answers={submission.answers.map((a) => ({
          id: a.id,
          questionId: a.questionId,
          prompt: a.question.prompt,
          blobUrl: a.blobUrl,
          durationMs: a.durationMs,
          transcript: a.transcript,
          signals: a.signals,
          engagement: a.engagement,
          summary: a.summary,
          streamStartSeconds: a.streamStartSeconds,
        }))}
      />
    </main>
  );
}
