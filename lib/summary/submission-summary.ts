import "server-only";

import { prisma } from "@/lib/db";
import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import { buildAnnotatedTranscript } from "@/lib/summary/annotate";
import type { SignalType } from "@/lib/interhuman/types";
import type {
  AnswerSummary,
  SubmissionSummary,
  WhisperSegment,
} from "@/lib/types";

const ANSWER_SYSTEM = `You are a senior qualitative researcher analyzing one answer from a video research interview.

Inputs you will receive: the question prompt, an annotated transcript where each line has the form
"START–ENDs [signal=probability | engagement=state] text",
and a JSON dump of all detected signal envelopes for context.

Return JSON of shape:
{
  "gist": string,
  "verbal_themes": string[],
  "nonverbal_observations": string[],   // observations grounded in the [signal=...] tags only
  "tension_points": string[],            // places where words and signals disagree (e.g. confident words + hesitation signal)
  "quotes": [{ "text": string, "reason": string }]
}

Rules:
- "verbal_themes" must come from what the respondent said.
- "nonverbal_observations" must reference specific signal types you saw, with rough timestamps when useful.
- "tension_points" should be empty when there is no genuine word/signal conflict — do not invent.
- Quote selection should prefer phrases that pair with a notable signal.`;

const SUBMISSION_SYSTEM = `You are summarising one respondent's full set of answers in a video research interview.

You will receive a JSON array of per-question summaries (already produced) plus a JSON array of all signal events.
Return JSON of shape:
{
  "headline": string,
  "per_question": [{ "questionId": string, "gist": string, "dominant_signals": string[] }],
  "engagement_arc": string,           // narrative of engagement across the interview
  "signal_distribution": [{ "type": string, "count": number }]
}`;

interface AnswerWithRelations {
  id: string;
  questionId: string;
  transcript: string | null;
  transcriptSegments: unknown;
  signals: unknown;
  engagement: unknown;
  streamStartSeconds: number | null;
  question: { prompt: string; helperText: string };
}

async function summarizeAnswer(answer: AnswerWithRelations): Promise<AnswerSummary> {
  const segments = (answer.transcriptSegments as { segments?: WhisperSegment[] } | WhisperSegment[] | null)
    ? Array.isArray(answer.transcriptSegments)
      ? (answer.transcriptSegments as WhisperSegment[])
      : ((answer.transcriptSegments as { segments?: WhisperSegment[] }).segments ?? [])
    : [];
  const signals = Array.isArray(answer.signals)
    ? (answer.signals as Array<{ type?: string; data?: object }>)
    : [];
  const engagement = Array.isArray(answer.engagement)
    ? (answer.engagement as Array<{ type?: string; data?: object }>)
    : [];

  const annotated = buildAnnotatedTranscript(
    segments,
    signals,
    engagement,
    answer.streamStartSeconds ?? 0,
  );

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: ANSWER_SYSTEM },
      {
        role: "user",
        content: [
          `QUESTION: ${answer.question.prompt}`,
          answer.question.helperText
            ? `HELPER: ${answer.question.helperText}`
            : null,
          "",
          "ANNOTATED TRANSCRIPT:",
          annotated || "(no transcript available)",
          "",
          "RAW SIGNALS:",
          JSON.stringify(signals).slice(0, 8000),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content) as AnswerSummary;
  } catch {
    return {
      gist: content.slice(0, 200),
      verbal_themes: [],
      nonverbal_observations: [],
      tension_points: [],
      quotes: [],
    };
  }
}

export async function generateSubmissionSummary(submissionId: string): Promise<{
  submissionSummary: SubmissionSummary;
  answers: { id: string; summary: AnswerSummary }[];
}> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      answers: {
        include: { question: true },
        orderBy: { question: { order: "asc" } },
      },
    },
  });
  if (!submission) throw new Error("Submission not found");

  // Per-answer pass — sequential to keep context predictable; small N anyway.
  const answerSummaries: { id: string; summary: AnswerSummary; questionId: string }[] = [];
  for (const ans of submission.answers) {
    if (!ans.transcript && (!ans.signals || (Array.isArray(ans.signals) && ans.signals.length === 0))) {
      // Skip empty answers (respondent may have skipped).
      continue;
    }
    const summary = await summarizeAnswer(ans);
    await prisma.answer.update({
      where: { id: ans.id },
      data: { summary: summary as object },
    });
    answerSummaries.push({ id: ans.id, summary, questionId: ans.questionId });
  }

  const allSignals = submission.answers
    .flatMap((a) => (Array.isArray(a.signals) ? (a.signals as object[]) : []))
    .slice(0, 1000);

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: SUBMISSION_SYSTEM },
      {
        role: "user",
        content: [
          "PER-QUESTION SUMMARIES:",
          JSON.stringify(answerSummaries),
          "",
          "ALL SIGNALS:",
          JSON.stringify(allSignals).slice(0, 12000),
        ].join("\n"),
      },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? "{}";
  let submissionSummary: SubmissionSummary;
  try {
    submissionSummary = JSON.parse(content) as SubmissionSummary;
  } catch {
    submissionSummary = {
      headline: content.slice(0, 200),
      per_question: [],
      engagement_arc: "",
      signal_distribution: countSignals(allSignals),
    };
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: { summary: submissionSummary as object },
  });

  return {
    submissionSummary,
    answers: answerSummaries.map(({ id, summary }) => ({ id, summary })),
  };
}

function countSignals(events: object[]): { type: SignalType; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const t = (e as { data?: { signal_type?: string } }).data?.signal_type;
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({
    type: type as SignalType,
    count,
  }));
}
