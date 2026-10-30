"use client";

import type { StudioQuestion } from "./studio-workspace";

export type QuestionChangeKind = "edit" | "structure";

export function QuestionList({
  questions,
  onChange,
}: {
  questions: StudioQuestion[];
  onChange: (next: StudioQuestion[], kind: QuestionChangeKind) => void;
}) {
  function update(idx: number, patch: Partial<StudioQuestion>) {
    const next = [...questions];
    next[idx] = { ...next[idx], ...patch };
    onChange(next, "edit");
  }
  function remove(idx: number) {
    onChange(
      questions.filter((_, i) => i !== idx),
      "structure",
    );
  }
  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next, "structure");
  }
  function add() {
    onChange(
      [...questions, { prompt: "", helperText: "", maxSeconds: 90 }],
      "structure",
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Questions</h2>
        <span className="text-xs text-muted-foreground">
          {questions.length} total
        </span>
      </div>
      <ul className="mt-3 space-y-3">
        {questions.map((q, i) => (
          <li
            key={q.id ?? `new-${i}`}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="flex items-start gap-2">
              <span className="mt-2 w-6 shrink-0 text-center text-xs font-mono text-muted-foreground">
                {i + 1}
              </span>
              <div className="flex-1 space-y-2">
                <textarea
                  value={q.prompt}
                  onChange={(e) => update(i, { prompt: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  placeholder="Question prompt"
                />
                <input
                  value={q.helperText ?? ""}
                  onChange={(e) => update(i, { helperText: e.target.value })}
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-foreground/40"
                  placeholder="Optional helper text shown below the prompt"
                />
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1">
                    Max seconds
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={q.maxSeconds ?? 90}
                      onChange={(e) =>
                        update(i, { maxSeconds: Number(e.target.value) || 90 })
                      }
                      className="w-16 rounded-md border border-border bg-card px-2 py-0.5 text-xs"
                    />
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  className="rounded-md border border-border px-2 py-1 text-xs"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  className="rounded-md border border-border px-2 py-1 text-xs"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-danger"
                >
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-3 w-full rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        + Add question
      </button>
    </section>
  );
}
