import "server-only";

import { prisma } from "@/lib/db";
import type { SignalProbability, SignalType } from "@/lib/interhuman/types";

export interface QuestionCue {
  respondent: string;
  submissionId: string;
  answerId: string;
  signalType: SignalType;
  start: number;
  end: number;
  probability: SignalProbability;
  rationale?: string;
  transcriptSnippet?: string;
}

export interface PerQuestionStats {
  questionId: string;
  order: number;
  prompt: string;
  respondentCount: number;
  signalCounts: Record<string, number>;
  dominantSignal: SignalType | null;
  totalSignals: number;
  cues: QuestionCue[];
}

export interface SignalShift {
  fromQuestionId: string;
  toQuestionId: string;
  fromOrder: number;
  toOrder: number;
  fromSignal: SignalType | null;
  toSignal: SignalType;
  prevCountOfNew: number;
  newCount: number;
  multiplier: number;
}

export interface PerQuestionAnalysis {
  questions: { id: string; order: number; prompt: string }[];
  perQuestion: PerQuestionStats[];
  shifts: SignalShift[];
}

interface RawSignalData {
  signal_type?: string;
  start?: number;
  end?: number;
  probability?: string;
  rationale?: string;
}

interface RawSignal {
  type?: string;
  data?: RawSignalData;
}

const SHIFT_MIN_COUNT = 2;
const SHIFT_MULTIPLIER = 2;

export async function getPerQuestionAnalysis(
  researchId: string,
): Promise<PerQuestionAnalysis> {
  const research = await prisma.research.findUnique({
    where: { id: researchId },
    include: {
      questions: { orderBy: { order: "asc" } },
      submissions: {
        where: { status: "finished" },
        include: {
          answers: { include: { question: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!research) throw new Error("Research not found");

  const respondentLabel = new Map<string, string>();
  research.submissions.forEach((s, idx) => {
    const display = s.respondentNickname ?? `R${idx + 1}`;
    respondentLabel.set(s.id, display);
  });

  const perQuestion: PerQuestionStats[] = research.questions.map((q) => ({
    questionId: q.id,
    order: q.order,
    prompt: q.prompt,
    respondentCount: 0,
    signalCounts: {},
    dominantSignal: null,
    totalSignals: 0,
    cues: [],
  }));
  const byId = new Map(perQuestion.map((q) => [q.questionId, q]));

  for (const submission of research.submissions) {
    const respondent = respondentLabel.get(submission.id) ?? submission.id;
    for (const answer of submission.answers) {
      const stats = byId.get(answer.questionId);
      if (!stats) continue;
      if (Array.isArray(answer.signals) && answer.signals.length > 0) {
        stats.respondentCount += 1;
      } else {
        // Still count as a respondent who answered but had no signals if blob exists.
        if (answer.blobUrl) stats.respondentCount += 1;
        continue;
      }
      const signals = answer.signals as unknown as RawSignal[];
      for (const env of signals) {
        const data = env?.data;
        if (!data?.signal_type) continue;
        const t = data.signal_type;
        stats.signalCounts[t] = (stats.signalCounts[t] ?? 0) + 1;
        stats.totalSignals += 1;
        const transcript = answer.transcript ?? "";
        const transcriptSnippet = transcript ? transcript.slice(0, 240) : undefined;
        stats.cues.push({
          respondent,
          submissionId: submission.id,
          answerId: answer.id,
          signalType: t as SignalType,
          start: data.start ?? 0,
          end: data.end ?? 0,
          probability: (data.probability ?? "medium") as SignalProbability,
          rationale: data.rationale,
          transcriptSnippet,
        });
      }
    }
  }

  for (const stats of perQuestion) {
    let dominant: SignalType | null = null;
    let maxCount = 0;
    for (const [type, count] of Object.entries(stats.signalCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = type as SignalType;
      }
    }
    stats.dominantSignal = dominant;
    stats.cues.sort((a, b) => a.start - b.start);
  }

  const shifts: SignalShift[] = [];
  for (let i = 1; i < perQuestion.length; i++) {
    const prev = perQuestion[i - 1];
    const curr = perQuestion[i];
    if (!curr.dominantSignal || !curr.signalCounts[curr.dominantSignal]) continue;
    if (curr.dominantSignal === prev.dominantSignal) continue;
    const newCount = curr.signalCounts[curr.dominantSignal];
    const prevCountOfNew = prev.signalCounts[curr.dominantSignal] ?? 0;
    if (newCount < SHIFT_MIN_COUNT) continue;
    const multiplier = prevCountOfNew === 0 ? Infinity : newCount / prevCountOfNew;
    if (multiplier < SHIFT_MULTIPLIER) continue;
    shifts.push({
      fromQuestionId: prev.questionId,
      toQuestionId: curr.questionId,
      fromOrder: prev.order,
      toOrder: curr.order,
      fromSignal: prev.dominantSignal,
      toSignal: curr.dominantSignal,
      prevCountOfNew,
      newCount,
      multiplier: Number.isFinite(multiplier) ? Number(multiplier.toFixed(1)) : -1,
    });
  }

  return {
    questions: research.questions.map((q) => ({
      id: q.id,
      order: q.order,
      prompt: q.prompt,
    })),
    perQuestion,
    shifts,
  };
}
