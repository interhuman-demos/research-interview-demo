"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SignalArcStrip } from "./signal-arc-strip";
import { SignalTimeline } from "./signal-timeline";

interface AnswerView {
  id: string;
  questionId: string;
  prompt: string;
  blobUrl: string | null;
  durationMs: number | null;
  transcript: string | null;
  signals: unknown;
  engagement: unknown;
  summary: unknown;
  streamStartSeconds: number | null;
}

export function SubmissionDetail({
  submissionId,
  respondent,
  status,
  summary,
  answers,
}: {
  submissionId: string;
  respondent: string;
  status: string;
  summary: object | null;
  answers: AnswerView[];
}) {
  const [pending, start] = useTransition();
  const [reanalyzing, setReanalyzing] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const headline = (summary as { headline?: string } | null)?.headline;
  const arc = (summary as { engagement_arc?: string } | null)?.engagement_arc;

  const hasAnyTranscript = answers.some((a) => !!a.transcript);
  const allSignalsEmpty = answers.every(
    (a) => !Array.isArray(a.signals) || a.signals.length === 0,
  );
  const showSignalsMissingBanner = hasAnyTranscript && allSignalsEmpty;

  const arcCells = answers.map((a, i) => {
    const sigs = (Array.isArray(a.signals) ? a.signals : []) as Array<{
      data?: { signal_type?: string };
    }>;
    const counts = new Map<string, number>();
    for (const s of sigs) {
      const t = s.data?.signal_type;
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    let dominant: string | null = null;
    let max = 0;
    for (const [t, n] of counts) {
      if (n > max) {
        max = n;
        dominant = t;
      }
    }
    return {
      questionId: a.id,
      order: i,
      prompt: a.prompt,
      dominantSignal: dominant,
      signalCount: sigs.length,
    };
  });
  const reanalyzableAnswerIds = answers
    .filter(
      (a) =>
        !!a.blobUrl &&
        (!Array.isArray(a.signals) || a.signals.length === 0),
    )
    .map((a) => a.id);

  async function reanalyzeOne(answerId: string): Promise<boolean> {
    setReanalyzing((prev) => new Set(prev).add(answerId));
    try {
      const res = await fetch(`/api/answer/${answerId}/reanalyze`, {
        method: "POST",
      });
      if (res.ok) {
        const json = (await res.json()) as {
          counts: { signals: number; engagement: number };
        };
        toast.success(
          `Captured ${json.counts.signals} signals, ${json.counts.engagement} engagement events`,
        );
        return true;
      }
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        tooLarge?: boolean;
      };
      if (res.status === 413 || err.tooLarge) {
        toast.error(
          err.error ?? "Video too large for offline analysis (32 MiB max)",
        );
      } else {
        toast.error(err.error ?? "Re-analyze failed");
      }
      return false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-analyze failed");
      return false;
    } finally {
      setReanalyzing((prev) => {
        const next = new Set(prev);
        next.delete(answerId);
        return next;
      });
    }
  }

  async function reanalyzeAllMissing() {
    setBulkPending(true);
    let ok = 0;
    let fail = 0;
    for (const id of reanalyzableAnswerIds) {
      const success = await reanalyzeOne(id);
      if (success) ok++;
      else fail++;
    }
    setBulkPending(false);
    if (fail === 0) {
      toast.success(`Re-analyzed ${ok} answer${ok === 1 ? "" : "s"}`);
    } else {
      toast.error(`${ok} succeeded, ${fail} failed`);
    }
    window.location.reload();
  }

  return (
    <div>
      <header className="mt-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Submission
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{respondent}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Status: {status}</p>
      </header>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Submission summary</h2>
          <button
            type="button"
            onClick={() =>
              start(async () => {
                const res = await fetch(
                  `/api/submission/${submissionId}/summary`,
                  { method: "POST" },
                );
                if (!res.ok) {
                  toast.error("Could not generate summary");
                  return;
                }
                toast.success("Summary updated");
                window.location.reload();
              })
            }
            disabled={pending}
            className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50"
          >
            {pending ? "Generating…" : summary ? "Regenerate" : "Generate"}
          </button>
        </div>
        {headline ? (
          <p className="mt-3 text-base">{headline}</p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No summary yet. Click generate to fold transcripts and social
            signals into a write-up.
          </p>
        )}
        {arc ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Engagement arc: {arc}
          </p>
        ) : null}
      </section>

      <SignalArcStrip cells={arcCells} />

      {showSignalsMissingBanner ? (
        <div className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">
                No Interhuman signals captured for this submission
              </p>
              <p className="mt-1">
                Transcripts came through, but the live signal stream produced
                zero envelopes. You can re-run analysis on the stored videos
                (32 MiB max per video).
              </p>
            </div>
            {reanalyzableAnswerIds.length > 0 ? (
              <button
                type="button"
                onClick={reanalyzeAllMissing}
                disabled={bulkPending}
                className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                {bulkPending
                  ? `Re-analyzing… (${reanalyzing.size}/${reanalyzableAnswerIds.length})`
                  : `Re-analyze all (${reanalyzableAnswerIds.length})`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="mt-6 space-y-6">
        {answers.map((a, i) => {
          const summary = a.summary as
            | {
                gist?: string;
                verbal_themes?: string[];
                nonverbal_observations?: string[];
                tension_points?: string[];
                quotes?: { text: string; reason?: string }[];
              }
            | null;
          const signals = (Array.isArray(a.signals) ? a.signals : []) as Array<{
            data?: { signal_type?: string; start?: number; end?: number; probability?: string };
          }>;
          const canReanalyze = !!a.blobUrl && signals.length === 0;
          const isReanalyzing = reanalyzing.has(a.id);
          return (
            <article
              key={a.id}
              id={`answer-${a.id}`}
              className="scroll-mt-24 rounded-lg border border-border bg-card p-5"
            >
              <header className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Q{i + 1}
                  </p>
                  <h2 className="mt-1 text-lg font-medium">{a.prompt}</h2>
                </div>
                {canReanalyze ? (
                  <button
                    type="button"
                    onClick={() =>
                      reanalyzeOne(a.id).then((ok) => {
                        if (ok) window.location.reload();
                      })
                    }
                    disabled={isReanalyzing || bulkPending}
                    className="shrink-0 rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50"
                    title="Send the stored video to Interhuman's offline analysis endpoint"
                  >
                    {isReanalyzing ? "Re-analyzing…" : "Re-analyze"}
                  </button>
                ) : null}
              </header>

              {a.blobUrl ? (
                <video
                  src={`/api/blob?u=${encodeURIComponent(a.blobUrl)}`}
                  controls
                  className="mt-4 aspect-video w-full rounded-md bg-black"
                />
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No recording.
                </p>
              )}

              <SignalTimeline
                signals={signals}
                durationMs={a.durationMs ?? 0}
                baseOffset={a.streamStartSeconds ?? 0}
              />

              {a.transcript ? (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Transcript
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap">{a.transcript}</p>
                </details>
              ) : null}

              {summary ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {summary.gist ? (
                    <div className="md:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Gist
                      </p>
                      <p className="mt-1 text-sm">{summary.gist}</p>
                    </div>
                  ) : null}
                  {summary.verbal_themes?.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Verbal themes
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                        {summary.verbal_themes.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {summary.nonverbal_observations?.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Nonverbal observations
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                        {summary.nonverbal_observations.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {summary.tension_points?.length ? (
                    <div className="md:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Tension points
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                        {summary.tension_points.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {summary.quotes?.length ? (
                    <div className="md:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Quotes
                      </p>
                      <ul className="mt-1 space-y-2 text-sm">
                        {summary.quotes.map((q, i) => (
                          <li
                            key={i}
                            className="rounded-md bg-muted px-3 py-2"
                          >
                            <p>“{q.text}”</p>
                            {q.reason ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {q.reason}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
