"use client";

import { colorFor } from "@/lib/analysis/signal-colors";

interface SignalEvent {
  data?: {
    signal_type?: string;
    start?: number;
    end?: number;
    probability?: string;
  };
}

export function SignalTimeline({
  signals,
  durationMs,
  baseOffset,
}: {
  signals: SignalEvent[];
  durationMs: number;
  baseOffset: number;
}) {
  if (!signals.length || durationMs <= 0) return null;
  const totalSec = durationMs / 1000;
  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Signals timeline
      </p>
      <div className="relative mt-2 h-10 w-full overflow-hidden rounded-md bg-muted">
        {signals.map((s, i) => {
          const start = (s.data?.start ?? 0) - baseOffset;
          const end = (s.data?.end ?? start) - baseOffset;
          const left = Math.max(0, (start / totalSec) * 100);
          const width = Math.max(1, ((end - start) / totalSec) * 100);
          const color = colorFor(s.data?.signal_type);
          return (
            <div
              key={i}
              title={`${s.data?.signal_type} (${s.data?.probability ?? "?"}) ${start.toFixed(1)}–${end.toFixed(1)}s`}
              className="absolute top-0 h-full"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: color,
                opacity: 0.7,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        {[...new Set(signals.map((s) => s.data?.signal_type).filter(Boolean))].map(
          (t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: colorFor(t) }}
              />
              {t}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
