import "server-only";

import type {
  ConversationQualityUpdatedData,
  EngagementUpdatedData,
  IncludeFlag,
  SignalDetectedData,
  SignalProbability,
  SignalType,
} from "@/lib/interhuman/types";

const ANALYZE_URL = "https://api.interhuman.ai/v1/upload/analyze";
export const ANALYZE_MAX_BYTES = 32 * 1024 * 1024;

interface AnalyzeResponse {
  engagement_state?: { start: number; end: number; state: string }[];
  signals?: {
    start: number;
    end: number;
    type: string;
    probability: string;
    rationale?: string;
  }[];
  conversation_quality?: {
    overall?: unknown;
    timeline?: unknown;
  };
}

export interface AnalyzeEnvelopes {
  signals: { type: "signal.detected"; data: SignalDetectedData }[];
  engagement: { type: "engagement.updated"; data: EngagementUpdatedData }[];
  conversationQuality: {
    type: "conversation_quality.updated";
    data: ConversationQualityUpdatedData;
  }[];
}

export class AnalyzeTooLargeError extends Error {
  constructor(public size: number) {
    super(
      `Video is ${(size / 1024 / 1024).toFixed(1)} MiB; offline analyze max is 32 MiB`,
    );
  }
}

export async function analyzeVideoBuffer(
  buffer: ArrayBuffer,
  contentType: string,
  include: IncludeFlag[],
): Promise<AnalyzeEnvelopes> {
  const apiKey = process.env.INTERHUMAN_API_KEY;
  if (!apiKey) throw new Error("INTERHUMAN_API_KEY is not set");
  if (buffer.byteLength > ANALYZE_MAX_BYTES) {
    throw new AnalyzeTooLargeError(buffer.byteLength);
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: contentType }),
    contentType.includes("mp4") ? "video.mp4" : "video.webm",
  );
  for (const flag of include) form.append("include[]", flag);

  const res = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Interhuman analyze ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as AnalyzeResponse;

  const signals = (json.signals ?? []).map((s) => ({
    type: "signal.detected" as const,
    data: {
      signal_type: s.type as SignalType,
      start: s.start,
      end: s.end,
      probability: s.probability as SignalProbability,
      ...(s.rationale ? { rationale: s.rationale } : {}),
    },
  }));
  const engagement = (json.engagement_state ?? []).map((e) => ({
    type: "engagement.updated" as const,
    data: { start: e.start, end: e.end, state: e.state },
  }));
  const conversationQuality = json.conversation_quality
    ? [
        {
          type: "conversation_quality.updated" as const,
          data: json.conversation_quality as ConversationQualityUpdatedData,
        },
      ]
    : [];

  return { signals, engagement, conversationQuality };
}
