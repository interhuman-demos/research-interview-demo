import type { WhisperSegment } from "@/lib/types";
import type { SignalType, SignalProbability } from "@/lib/interhuman/types";

interface SignalEnvelope {
  type?: string;
  data?: {
    signal_type?: SignalType;
    start?: number;
    end?: number;
    probability?: SignalProbability;
    state?: string;
  };
}

/**
 * Build a transcript with inline social-signal annotations.
 *
 * Both Whisper segment timestamps and Interhuman signal timestamps are seconds
 * relative to the start of the answer's recording window (we normalise the
 * Interhuman absolute-session times when persisting). Overlap is inclusive.
 */
export function buildAnnotatedTranscript(
  whisperSegments: WhisperSegment[] | undefined,
  signals: SignalEnvelope[],
  engagement: SignalEnvelope[],
  baseOffsetSeconds = 0,
): string {
  if (!whisperSegments || whisperSegments.length === 0) return "";

  const lines: string[] = [];
  for (const seg of whisperSegments) {
    const overlapping = signals.filter((s) => overlap(s, seg, baseOffsetSeconds));
    const eng = engagement.filter((e) => overlap(e, seg, baseOffsetSeconds));
    const annotations: string[] = [];
    if (overlapping.length) {
      annotations.push(
        overlapping
          .map((s) => `${s.data?.signal_type}=${s.data?.probability ?? "?"}`)
          .join(", "),
      );
    }
    if (eng.length) {
      annotations.push(`engagement=${eng.map((e) => e.data?.state).join("/")}`);
    }
    const tag = annotations.length ? ` [${annotations.join(" | ")}]` : "";
    lines.push(
      `${seg.start.toFixed(1)}–${seg.end.toFixed(1)}s${tag} ${seg.text.trim()}`,
    );
  }
  return lines.join("\n");
}

function overlap(env: SignalEnvelope, seg: WhisperSegment, base: number) {
  const s = env.data?.start;
  const e = env.data?.end;
  if (typeof s !== "number" || typeof e !== "number") return false;
  // Convert from absolute session-cumulative to per-answer if a base offset is given.
  const ns = s - base;
  const ne = e - base;
  return ne >= seg.start && ns <= seg.end;
}
