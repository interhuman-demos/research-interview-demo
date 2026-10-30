"use client";

export function TopicForm({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <label className="text-sm font-medium">Research topic</label>
      <p className="mt-1 text-xs text-muted-foreground">
        One sentence is enough. The AI co-pilot below will refine it with you.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        rows={2}
        placeholder="e.g. Why are mid-income drivers in Spain hesitant to switch to electric cars?"
        className="mt-3 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
      />
    </section>
  );
}
