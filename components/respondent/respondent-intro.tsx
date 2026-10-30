"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function RespondentIntro({
  slug,
  title,
  topic,
  questionCount,
}: {
  slug: string;
  title: string;
  topic: string;
  questionCount: number;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [pending, start] = useTransition();

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Research interview
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      {topic ? <p className="mt-3 text-muted-foreground">{topic}</p> : null}

      <div className="mt-8 rounded-lg border border-border bg-card p-5 text-sm">
        <p className="font-medium">Before you start</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>You will see {questionCount} questions, one at a time.</li>
          <li>
            Your camera and microphone will be on. We use them to capture how
            you answer (tone, engagement) alongside what you say.
          </li>
          <li>
            By continuing you consent to your answers being recorded and
            analyzed for this research.
          </li>
        </ul>
      </div>

      <div className="mt-8">
        <label className="text-sm font-medium">
          Nickname (optional)
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="How should we refer to you?"
            maxLength={120}
          />
        </label>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              const res = await fetch("/api/submission", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  slug,
                  nickname: nickname.trim() || undefined,
                }),
              });
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as {
                  error?: string;
                };
                toast.error(data.error ?? "Could not start interview");
                return;
              }
              const data = (await res.json()) as {
                submissionId: string;
                streamSessionId: string;
                streamToken: string;
              };
              const url = new URL(`/r/${slug}/run`, window.location.origin);
              url.searchParams.set("s", data.submissionId);
              url.searchParams.set("ss", data.streamSessionId);
              url.searchParams.set("st", data.streamToken);
              router.push(url.toString().replace(window.location.origin, ""));
            })
          }
          disabled={pending}
          className="mt-5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {pending ? "Starting…" : "I consent — start"}
        </button>
      </div>
    </div>
  );
}
