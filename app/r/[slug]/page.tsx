import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { RespondentIntro } from "@/components/respondent/respondent-intro";

export const dynamic = "force-dynamic";

export default async function RespondentLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const research = await prisma.research.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      topic: true,
      description: true,
      status: true,
      questions: { select: { id: true } },
    },
  });
  if (!research || research.status !== "live") notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <RespondentIntro
        slug={research.slug}
        title={research.title}
        topic={research.topic}
        questionCount={research.questions.length}
      />
    </main>
  );
}
