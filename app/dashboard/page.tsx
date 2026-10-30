import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NewResearchButton } from "@/components/studio/new-research-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const items = await prisma.research.findMany({
    where: { creatorId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { submissions: true, questions: true } } },
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Your research</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {session.user.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mt-8">
        <NewResearchButton />
      </div>

      <ul className="mt-8 grid gap-3">
        {items.length === 0 ? (
          <li className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            No research yet. Create one above to get started.
          </li>
        ) : (
          items.map((r) => (
            <li
              key={r.id}
              className="min-w-0 rounded-lg border border-border bg-card p-5 transition hover:border-foreground/20"
            >
              <Link
                href={`/studio/${r.id}`}
                className="flex min-w-0 items-center justify-between gap-6"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-medium">{r.title}</h2>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {r.topic || "No topic yet"}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>{r._count.questions} questions</div>
                  <div>{r._count.submissions} submissions</div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
