"use client";

import { useEffect } from "react";

import type { InsightSource } from "@/lib/types";

export interface InsightModalContent {
  text: string;
  eyebrow?: string;
  sources: InsightSource[];
}

export function InsightModal({
  insight,
  onClose,
}: {
  insight: InsightModalContent;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Insight details"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            <span aria-hidden>✦</span>
            {insight.eyebrow ?? "Interhuman signal insight"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <h3 className="mt-3 text-lg font-semibold leading-snug">
          {insight.text}
        </h3>

        {insight.sources.length === 0 ? (
          <p className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            No source attribution on this entry. Regenerate the summary to
            populate respondent-level grounding.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {insight.sources.map((s, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-muted/40 p-4"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent">
                    {s.respondent}
                  </span>
                  <span className="truncate">{s.questionPrompt}</span>
                </div>
                {s.quote ? (
                  <p className="mt-3 border-l-2 border-accent/40 pl-3 text-sm italic text-muted-foreground">
                    “{s.quote}”
                  </p>
                ) : null}
                <p className="mt-3 text-sm leading-relaxed">{s.reasoning}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Powered by Interhuman · multimodal research
        </p>
      </div>
    </div>
  );
}
