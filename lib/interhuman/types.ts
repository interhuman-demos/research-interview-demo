export type SignalType =
  | "agreement"
  | "confidence"
  | "confusion"
  | "disagreement"
  | "disengagement"
  | "engagement"
  | "frustration"
  | "hesitation"
  | "interest"
  | "skepticism"
  | "stress"
  | "uncertainty";

export type SignalProbability = "high" | "medium" | "low";

export interface SignalDetectedData {
  signal_type: SignalType;
  start: number;
  end: number;
  probability: SignalProbability;
  rationale?: string;
}

export interface EngagementUpdatedData {
  start: number;
  end: number;
  state: string;
  score?: number;
}

export interface ConversationQualityUpdatedData {
  overall?: unknown;
  timeline?: unknown;
}

export interface ErrorData {
  code: string;
  message: string;
  link?: string;
  segment?: number;
}

export type StreamEnvelope =
  | {
      type: "signal.detected";
      timestamp: string;
      correlation_id: string;
      data: SignalDetectedData;
    }
  | {
      type: "engagement.updated";
      timestamp: string;
      correlation_id: string;
      data: EngagementUpdatedData;
    }
  | {
      type: "conversation_quality.updated";
      timestamp: string;
      correlation_id: string;
      data: ConversationQualityUpdatedData;
    }
  | {
      type: "error";
      timestamp: string;
      correlation_id: string;
      data: ErrorData;
    };

export type IncludeFlag =
  | "conversation_quality_overall"
  | "conversation_quality_timeline";
