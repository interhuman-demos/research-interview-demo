"use client";

import { colorFor } from "@/lib/analysis/signal-colors";

interface ArcCell {
  questionId: string;
  order: number;
  prompt: string;
  dominantSignal: string | null;
  signalCount: number;
}

export function SignalArcStrip({ cells }: { cells: ArcCell[] }) {
  if (cells.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Signal arc
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Click a question to jump
        </p>
      </div>
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((cell) => {
          const color = cell.dominantSignal ? colorFor(cell.dominantSignal) : null;
          const empty = !color;
          return (
            <a
              key={cell.questionId}
              href={`#answer-${cell.questionId}`}
              title={`${cell.prompt}\n${cell.signalCount} ${cell.signalCount === 1 ? "cue" : "cues"}`}
              className="group flex flex-col items-stretch overflow-hidden rounded-md border border-border bg-card transition hover:border-accent/40"
            >
              <div
                className="px-2 py-3 text-center"
                style={
                  empty
                    ? undefined
                    : {
                        background: `${color}22`,
                        borderBottom: `3px solid ${color}`,
                      }
                }
              >
                <div className="text-xs font-semibold">Q{cell.order + 1}</div>
                <div
                  className="mt-1 text-[10px] font-medium uppercase tracking-wide"
                  style={empty ? undefined : { color }}
                >
                  {cell.dominantSignal ?? "—"}
                </div>
              </div>
              <div className="px-2 py-1 text-center text-[10px] text-muted-foreground">
                {cell.signalCount} {cell.signalCount === 1 ? "cue" : "cues"}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
