import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage({
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
      submissions: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { answers: true } } },
      },
    },
  });
  if (!research || research.creatorId !== session.user.id) notFound();

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
            href={`/studio/${id}/questions`}
            className="text-muted-foreground hover:text-foreground"
          >
            Question analysis
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
        <h1 className="text-2xl font-semibold">Submissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {research.submissions.length} total
        </p>
      </header>
      <ul className="mt-6 grid gap-3">
        {research.submissions.length === 0 ? (
          <li className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            No submissions yet. Share the link to start collecting.
          </li>
        ) : (
          research.submissions.map((s) => {
            const headline =
              (s.summary as { headline?: string } | null)?.headline ?? null;
            return (
              <li
                key={s.id}
                className="rounded-lg border border-border bg-card p-5"
              >
                <Link
                  href={`/studio/${id}/submissions/${s.id}`}
                  className="flex items-center justify-between gap-6"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {s.respondentNickname ?? "Anonymous"} ·{" "}
                      <span className="text-muted-foreground">{s.status}</span>
                    </p>
                    {headline ? (
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {headline}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {s._count.answers} answers
                    <br />
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
