import type { SignalType, SignalProbability } from "@/lib/interhuman/types";

export interface WhisperSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
}

export interface WhisperResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: WhisperSegment[];
}

export interface StoredSignal {
  type: SignalType;
  start: number;
  end: number;
  probability: SignalProbability;
}

export interface StoredEngagement {
  start: number;
  end: number;
  state: string;
  score?: number;
}

export interface AnswerSummary {
  gist: string;
  verbal_themes: string[];
  nonverbal_observations: string[];
  tension_points: string[];
  quotes: { text: string; reason?: string }[];
}

export interface SubmissionSummary {
  headline: string;
  per_question: { questionId: string; gist: string; dominant_signals: string[] }[];
  engagement_arc: string;
  signal_distribution: { type: SignalType; count: number }[];
}

export interface InsightSource {
  respondent: string;
  questionPrompt: string;
  quote?: string;
  reasoning: string;
}

export interface InsightWithSources {
  text: string;
  sources: InsightSource[];
}

export type SignalInsight = string | InsightWithSources;

export type RecommendationItem = string | InsightWithSources;

export interface ResearchSummaryBody {
  themes: {
    title: string;
    frequency: number;
    supporting_quotes: string[];
    sources?: InsightSource[];
  }[];
  signal_patterns: { description: string; evidence: string[] }[];
  segments: { name: string; description: string }[];
  recommendations: RecommendationItem[];
  notes_only_visible_via_signals: SignalInsight[];
}
