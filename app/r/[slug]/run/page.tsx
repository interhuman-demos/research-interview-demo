import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { QuestionRunner } from "@/components/respondent/question-runner";

export const dynamic = "force-dynamic";

export default async function RespondentRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ s?: string; ss?: string; st?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!sp.s || !sp.ss || !sp.st) notFound();

  const research = await prisma.research.findUnique({
    where: { slug },
    select: {
      title: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          prompt: true,
          helperText: true,
          maxSeconds: true,
        },
      },
    },
  });
  if (!research) notFound();

  // Look up answer ids for this submission.
  const answers = await prisma.answer.findMany({
    where: { submissionId: sp.s },
    select: { id: true, questionId: true },
  });
  const answerByQuestion = Object.fromEntries(
    answers.map((a) => [a.questionId, a.id]),
  );
  const questions = research.questions.map((q) => ({
    ...q,
    answerId: answerByQuestion[q.id],
  }));
  if (questions.some((q) => !q.answerId)) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <QuestionRunner
        title={research.title}
        submissionId={sp.s}
        streamSessionId={sp.ss}
        streamToken={sp.st}
        questions={questions as Required<typeof questions[number]>[]}
      />
    </main>
  );
}
