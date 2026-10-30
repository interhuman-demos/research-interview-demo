"use client";

import { useEffect, useMemo, useState } from "react";

import { colorFor, SIGNAL_COLOR } from "@/lib/analysis/signal-colors";
import type {
  PerQuestionAnalysis,
  PerQuestionStats,
  QuestionCue,
  SignalShift,
} from "@/lib/analysis/per-question";
import type { SignalProbability, SignalType } from "@/lib/interhuman/types";

const ALL_SIGNAL_TYPES = Object.keys(SIGNAL_COLOR) as SignalType[];
const ALL_PROBABILITIES: SignalProbability[] = ["high", "medium", "low"];

export function QuestionAnalysisView({
  analysis,
}: {
  analysis: PerQuestionAnalysis;
}) {
  const [signalFilter, setSignalFilter] = useState<Set<SignalType>>(
    new Set(ALL_SIGNAL_TYPES),
  );
  const [probabilityFilter, setProbabilityFilter] = useState<
    Set<SignalProbability>
  >(new Set(ALL_PROBABILITIES));
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterAnalysis(analysis, signalFilter, probabilityFilter),
    [analysis, signalFilter, probabilityFilter],
  );

  const maxTotal = Math.max(1, ...filtered.map((q) => q.totalSignals));
  const openStats =
    filtered.find((q) => q.questionId === openQuestionId) ?? null;

  useEffect(() => {
    if (!openQuestionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenQuestionId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openQuestionId]);

  return (
    <div className="mt-8 space-y-8">
      <ShiftsCallout shifts={analysis.shifts} />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Dominant signal per question</h2>
          <p className="text-xs text-muted-foreground">
            Click a column for cue-level detail
          </p>
        </div>
        <Filters
          signalFilter={signalFilter}
          probabilityFilter={probabilityFilter}
          onToggleSignal={(t) =>
            setSignalFilter((prev) => toggle(prev, t, ALL_SIGNAL_TYPES))
          }
          onToggleProbability={(p) =>
            setProbabilityFilter((prev) =>
              toggle(prev, p, ALL_PROBABILITIES),
            )
          }
        />
        <Chart
          stats={filtered}
          maxTotal={maxTotal}
          activeId={openQuestionId}
          onSelect={(id) => setOpenQuestionId(id)}
        />
      </section>

      {openStats ? (
        <CuePanel
          stats={openStats}
          signalFilter={signalFilter}
          probabilityFilter={probabilityFilter}
          onClose={() => setOpenQuestionId(null)}
        />
      ) : null}
    </div>
  );
}

function ShiftsCallout({ shifts }: { shifts: SignalShift[] }) {
  if (!shifts.length) return null;
  return (
    <section className="rounded-lg border border-accent/30 bg-accent/5 p-5">
      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">
        <span aria-hidden>✦</span>
        Significant signal shifts
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {shifts.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-2 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
            />
            <span>
              <strong>
                Q{s.fromOrder + 1} → Q{s.toOrder + 1}
              </strong>
              {": "}
              dominant signal moved from{" "}
              {s.fromSignal ? (
                <SignalChip signal={s.fromSignal} />
              ) : (
                <span className="text-muted-foreground">none</span>
              )}{" "}
              to <SignalChip signal={s.toSignal} />
              {s.multiplier === -1 ? (
                <span className="text-muted-foreground">
                  {" "}
                  (new signal — not seen on the previous question)
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {" "}
                  ({s.multiplier}× the previous question&apos;s count)
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Filters({
  signalFilter,
  probabilityFilter,
  onToggleSignal,
  onToggleProbability,
}: {
  signalFilter: Set<SignalType>;
  probabilityFilter: Set<SignalProbability>;
  onToggleSignal: (t: SignalType) => void;
  onToggleProbability: (p: SignalProbability) => void;
}) {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 text-xs text-muted-foreground">Signals:</span>
        {ALL_SIGNAL_TYPES.map((t) => {
          const active = signalFilter.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggleSignal(t)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition ${
                active
                  ? "border-border bg-card"
                  : "border-border/50 bg-transparent text-muted-foreground"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: colorFor(t), opacity: active ? 1 : 0.4 }}
              />
              {t}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 text-xs text-muted-foreground">Probability:</span>
        {ALL_PROBABILITIES.map((p) => {
          const active = probabilityFilter.has(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => onToggleProbability(p)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                active
                  ? "border-border bg-card"
                  : "border-border/50 bg-transparent text-muted-foreground"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MAX_BAR_PX = 180;

function Chart({
  stats,
  maxTotal,
  activeId,
  onSelect,
}: {
  stats: PerQuestionStats[];
  maxTotal: number;
  activeId: string | null;
  onSelect: (questionId: string) => void;
}) {
  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="flex items-stretch gap-2">
        {stats.map((q) => {
          const isActive = q.questionId === activeId;
          const barPx =
            q.totalSignals > 0
              ? Math.max(8, Math.round((q.totalSignals / maxTotal) * MAX_BAR_PX))
              : 4;
          const truncated = truncatePrompt(q.prompt, 64);
          return (
            <button
              key={q.questionId}
              type="button"
              onClick={() => onSelect(q.questionId)}
              title={`${q.prompt}\n\n${tooltipFor(q)}`}
              className={`group flex min-w-0 flex-1 flex-col items-stretch gap-2 rounded-md border px-2 py-3 text-left transition ${
                isActive
                  ? "border-accent/40 bg-accent/5 ring-2 ring-accent/30"
                  : "border-transparent hover:bg-muted/40"
              }`}
            >
              <div className="text-center text-xs font-medium text-muted-foreground">
                {q.totalSignals} {q.totalSignals === 1 ? "cue" : "cues"}
              </div>
              <div
                className="flex w-full flex-col-reverse self-center overflow-hidden rounded-sm"
                data-bar={q.questionId}
                style={{ height: barPx, width: "70%", minWidth: 32, maxWidth: 80 }}
              >
                {q.totalSignals === 0 ? (
                  <div className="h-full w-full bg-muted" />
                ) : (
                  Object.entries(q.signalCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([type, count]) => {
                      const seg = (count / q.totalSignals) * 100;
                      return (
                        <div
                          key={type}
                          style={{
                            height: `${seg}%`,
                            background: colorFor(type),
                          }}
                        />
                      );
                    })
                )}
              </div>
              <div className="mt-1 text-center text-sm font-semibold">
                Q{q.order + 1}
              </div>
              <div className="line-clamp-2 min-h-[2.4em] text-center text-[11px] leading-tight text-muted-foreground">
                {truncated}
              </div>
              <div className="flex justify-center">
                {q.dominantSignal ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: `${colorFor(q.dominantSignal)}22`,
                      color: colorFor(q.dominantSignal),
                    }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: colorFor(q.dominantSignal) }}
                    />
                    {q.dominantSignal}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    no signals
                  </span>
                )}
              </div>
              <div className="text-center text-[10px] text-muted-foreground">
                {q.respondentCount}{" "}
                {q.respondentCount === 1 ? "respondent" : "respondents"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function truncatePrompt(prompt: string, max: number): string {
  if (prompt.length <= max) return prompt;
  return prompt.slice(0, max - 1).trimEnd() + "…";
}

function CuePanel({
  stats,
  signalFilter,
  probabilityFilter,
  onClose,
}: {
  stats: PerQuestionStats;
  signalFilter: Set<SignalType>;
  probabilityFilter: Set<SignalProbability>;
  onClose: () => void;
}) {
  const cues = stats.cues.filter(
    (c) => signalFilter.has(c.signalType) && probabilityFilter.has(c.probability),
  );
  const grouped = new Map<string, QuestionCue[]>();
  for (const cue of cues) {
    const list = grouped.get(cue.respondent) ?? [];
    list.push(cue);
    grouped.set(cue.respondent, list);
  }
  const dominantSig = stats.dominantSignal;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Question cues"
      className="fixed inset-0 z-50"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card shadow-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card p-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Q{stats.order + 1} · {stats.totalSignals} cues across{" "}
              {stats.respondentCount} respondents
            </p>
            <h2 className="mt-2 text-lg font-semibold leading-snug">
              {stats.prompt}
            </h2>
            {dominantSig ? (
              <div
                className="mt-3 inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs"
                style={{
                  background: `${colorFor(dominantSig)}22`,
                  color: colorFor(dominantSig),
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: colorFor(dominantSig) }}
                />
                Dominant: {dominantSig}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 p-5">
          {cues.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              No cues match the current filters. If submissions show signals
              but no rationale text, re-analyze them from each submission&apos;s
              detail page to populate Interhuman&apos;s per-cue explanations.
            </div>
          ) : (
            <ul className="space-y-5">
              {[...grouped.entries()].map(([respondent, list]) => (
                <li key={respondent}>
                  <p className="text-sm font-medium">
                    {respondent}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {list.length} cue{list.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  <ul className="mt-2 space-y-2">
                    {list.map((c, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-border bg-muted/40 p-3 text-sm"
                      >
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className="rounded-full px-2 py-0.5"
                            style={{
                              background: `${colorFor(c.signalType)}22`,
                              color: colorFor(c.signalType),
                            }}
                          >
                            {c.signalType}
                          </span>
                          <span className="rounded border border-border px-1.5 py-0.5">
                            {c.probability}
                          </span>
                          <span>
                            {c.start.toFixed(1)}–{c.end.toFixed(1)}s
                          </span>
                        </div>
                        <p className="mt-2">
                          {c.rationale ?? (
                            <span className="text-muted-foreground">
                              {c.signalType} detected ({c.probability}). Re-analyze
                              this submission to populate the rationale.
                            </span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function SignalChip({ signal }: { signal: SignalType }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: `${colorFor(signal)}22`,
        color: colorFor(signal),
      }}
    >
      {signal}
    </span>
  );
}

function tooltipFor(q: PerQuestionStats): string {
  const lines: string[] = [`Q${q.order + 1}: ${q.totalSignals} cues`];
  for (const [type, count] of Object.entries(q.signalCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`${type}: ${count}`);
  }
  return lines.join("\n");
}

function filterAnalysis(
  analysis: PerQuestionAnalysis,
  signalFilter: Set<SignalType>,
  probabilityFilter: Set<SignalProbability>,
): PerQuestionStats[] {
  return analysis.perQuestion.map((q) => {
    const cues = q.cues.filter(
      (c) =>
        signalFilter.has(c.signalType) && probabilityFilter.has(c.probability),
    );
    const counts: Record<string, number> = {};
    for (const c of cues) counts[c.signalType] = (counts[c.signalType] ?? 0) + 1;
    let dominant: SignalType | null = null;
    let max = 0;
    for (const [t, n] of Object.entries(counts)) {
      if (n > max) {
        max = n;
        dominant = t as SignalType;
      }
    }
    return {
      ...q,
      cues,
      signalCounts: counts,
      totalSignals: cues.length,
      dominantSignal: dominant,
    };
  });
}

function toggle<T>(set: Set<T>, value: T, all: T[]): Set<T> {
  // Click behavior: if everything is on, clicking isolates to just that value;
  // clicking the only-on value resets to all.
  if (set.size === all.length) {
    return new Set([value]);
  }
  if (set.size === 1 && set.has(value)) {
    return new Set(all);
  }
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  if (next.size === 0) return new Set(all);
  return next;
}
