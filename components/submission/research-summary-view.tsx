"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { QuestionAnalysisView } from "@/components/studio/question-analysis-view";
import {
  InsightModal,
  type InsightModalContent,
} from "@/components/submission/insight-modal";
import type { PerQuestionAnalysis } from "@/lib/analysis/per-question";
import type { InsightSource, SignalInsight } from "@/lib/types";

interface ThemeWithSources {
  title: string;
  frequency: number;
  supporting_quotes: string[];
  sources?: InsightSource[];
}

type RecommendationItem = string | { text: string; sources?: InsightSource[] };

interface ResearchSummary {
  themes?: ThemeWithSources[];
  signal_patterns?: { description: string; evidence: string[] }[];
  segments?: { name: string; description: string }[];
  recommendations?: RecommendationItem[];
  notes_only_visible_via_signals?: SignalInsight[];
}

function normalizeInsight(item: SignalInsight): InsightModalContent {
  if (typeof item === "string") return { text: item, sources: [] };
  return { text: item.text, sources: item.sources ?? [] };
}

function themeQuotesAsSources(theme: ThemeWithSources): InsightSource[] {
  if (theme.sources?.length) return theme.sources;
  // Older summaries: synthesise minimal sources from supporting_quotes so the
  // modal still has something to show.
  return theme.supporting_quotes.map((quote) => ({
    respondent: "—",
    questionPrompt: "",
    quote,
    reasoning: "",
  }));
}

function normalizeRecommendation(item: RecommendationItem): InsightModalContent {
  if (typeof item === "string") return { text: item, sources: [] };
  return { text: item.text, sources: item.sources ?? [] };
}

export function ResearchSummaryView({
  researchId,
  title,
  submissionCount,
  initialSummary,
  generatedAt,
  analysis,
}: {
  researchId: string;
  title: string;
  submissionCount: number;
  initialSummary: object | null;
  generatedAt: Date | null;
  analysis: PerQuestionAnalysis;
}) {
  const [summary, setSummary] = useState<ResearchSummary | null>(
    (initialSummary as ResearchSummary) ?? null,
  );
  const [pending, start] = useTransition();
  const [openInsight, setOpenInsight] = useState<InsightModalContent | null>(
    null,
  );

  const peakShift = analysis.shifts[0] ?? null;

  return (
    <div>
      <header className="mt-4 flex items-end justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Aggregate summary
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {submissionCount} submissions
            {generatedAt
              ? ` · last generated ${new Date(generatedAt).toLocaleString()}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              const res = await fetch(`/api/research/${researchId}/summary`, {
                method: "POST",
              });
              if (!res.ok) {
                toast.error("Could not generate summary");
                return;
              }
              const data = (await res.json()) as { summary: ResearchSummary };
              setSummary(data.summary);
              toast.success("Summary updated");
            })
          }
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {pending ? "Generating…" : summary ? "Regenerate" : "Generate"}
        </button>
      </header>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Emotional shape of the study
        </h2>
        <div className="mt-3">
          <QuestionAnalysisView analysis={analysis} />
        </div>
        {peakShift ? (
          <p className="mt-3 text-sm text-muted-foreground">
            <strong className="text-foreground">Peak shift: </strong>
            Q{peakShift.fromOrder + 1} → Q{peakShift.toOrder + 1} moved from{" "}
            <em>{peakShift.fromSignal ?? "no dominant signal"}</em> to{" "}
            <em>{peakShift.toSignal}</em>
            {peakShift.multiplier === -1
              ? " (a signal not seen on the previous question)"
              : ` (${peakShift.multiplier}× the previous question's count)`}
            .
          </p>
        ) : null}
      </section>

      {!summary ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No aggregate summary yet. Generate one once you have at least one
          finished submission.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {summary.themes?.length ? (
            <Section title="Themes">
              <ul className="space-y-3">
                {summary.themes.map((t, i) => {
                  const sources = themeQuotesAsSources(t);
                  const hasDetails = sources.length > 0;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={
                          hasDetails
                            ? () =>
                                setOpenInsight({
                                  text: t.title,
                                  eyebrow: `Theme · ${t.frequency} respondent${
                                    t.frequency === 1 ? "" : "s"
                                  }`,
                                  sources,
                                })
                            : undefined
                        }
                        disabled={!hasDetails}
                        className={`group flex w-full flex-col rounded-md border border-border bg-card p-4 text-left transition ${
                          hasDetails ? "hover:border-accent/40" : ""
                        }`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">
                            {t.title}{" "}
                            <span className="text-muted-foreground">
                              × {t.frequency}
                            </span>
                          </span>
                          {hasDetails ? (
                            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent opacity-70 transition group-hover:opacity-100">
                              See cues →
                            </span>
                          ) : null}
                        </span>
                        <ul className="mt-2 space-y-1 text-sm">
                          {t.supporting_quotes.map((q, j) => (
                            <li key={j} className="text-muted-foreground">
                              “{q}”
                            </li>
                          ))}
                        </ul>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {summary.notes_only_visible_via_signals?.length ? (
            <section className="rounded-lg border border-accent/30 bg-accent/5 p-6">
              <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">
                <span aria-hidden>✦</span>
                Interhuman signal insights
              </p>
              <h3 className="mt-3 text-lg font-semibold">
                What our multimodal layer surfaced
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Findings the words alone would have missed — derived from
                Interhuman&apos;s social-signal analysis.
              </p>
              <ul className="mt-5 space-y-2 text-sm leading-relaxed">
                {summary.notes_only_visible_via_signals
                  .map(normalizeInsight)
                  .map((insight, i) => {
                    const hasDetails = insight.sources.length > 0;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={
                            hasDetails
                              ? () => setOpenInsight(insight)
                              : undefined
                          }
                          disabled={!hasDetails}
                          className={`group flex w-full items-start gap-3 rounded-md p-2 text-left transition ${
                            hasDetails
                              ? "cursor-pointer hover:bg-accent/10"
                              : "cursor-default"
                          }`}
                        >
                          <span
                            aria-hidden
                            className="mt-2 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                          />
                          <span className="flex-1">{insight.text}</span>
                          {hasDetails ? (
                            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent opacity-70 transition group-hover:opacity-100">
                              See details →
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
              </ul>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Powered by Interhuman · multimodal research
              </p>
            </section>
          ) : null}

          {summary.signal_patterns?.length ? (
            <Section title="Signal patterns">
              <ul className="space-y-3">
                {summary.signal_patterns.map((p, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-border bg-card p-4"
                  >
                    <p className="text-sm">{p.description}</p>
                    {p.evidence?.length ? (
                      <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                        {p.evidence.map((e, j) => (
                          <li key={j}>{e}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {summary.segments?.length ? (
            <Section title="Segments">
              <ul className="grid gap-3 md:grid-cols-2">
                {summary.segments.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-border bg-card p-4"
                  >
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {s.description}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {summary.recommendations?.length ? (
            <Section title="Recommendations">
              <ul className="space-y-2 text-sm">
                {summary.recommendations.map((r, i) => {
                  const item = normalizeRecommendation(r);
                  const hasDetails = item.sources.length > 0;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={
                          hasDetails
                            ? () =>
                                setOpenInsight({
                                  text: item.text,
                                  eyebrow: "Recommendation",
                                  sources: item.sources,
                                })
                            : undefined
                        }
                        disabled={!hasDetails}
                        className={`group flex w-full items-start gap-3 rounded-md border border-border bg-card p-3 text-left transition ${
                          hasDetails ? "hover:border-accent/40" : ""
                        }`}
                      >
                        <span
                          aria-hidden
                          className="mt-2 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                        />
                        <span className="flex-1">{item.text}</span>
                        {hasDetails ? (
                          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent opacity-70 transition group-hover:opacity-100">
                            See cues →
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
        </div>
      )}

      {openInsight ? (
        <InsightModal
          insight={openInsight}
          onClose={() => setOpenInsight(null)}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
