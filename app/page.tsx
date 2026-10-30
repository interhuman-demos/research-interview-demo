import Link from "next/link";

import { auth, signIn } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl w-full">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Interhuman Research
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
          Read the room, not just the transcript.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Set up a research topic, draft questions with an AI co-pilot, and
          share a link. Respondents answer on camera while we capture both what
          they say and how they say it — confidence, hesitation, engagement —
          and fold both into your summaries.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          {session?.user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Go to dashboard
            </Link>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
              >
                Sign in with Google
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
