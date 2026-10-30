import type { SignalType } from "@/lib/interhuman/types";

export const SIGNAL_COLOR: Record<SignalType, string> = {
  agreement: "#3b82f6",
  confidence: "#10b981",
  confusion: "#f59e0b",
  disagreement: "#ef4444",
  disengagement: "#6b7280",
  engagement: "#10b981",
  frustration: "#ef4444",
  hesitation: "#f59e0b",
  interest: "#3b82f6",
  skepticism: "#a855f7",
  stress: "#ef4444",
  uncertainty: "#f59e0b",
};

export function colorFor(signalType: string | undefined): string {
  if (!signalType) return "#888";
  return SIGNAL_COLOR[signalType as SignalType] ?? "#888";
}
