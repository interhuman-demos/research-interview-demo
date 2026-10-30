import "server-only";

import { prisma } from "@/lib/db";
import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import type { ResearchSummaryBody } from "@/lib/types";

const RESEARCH_SYSTEM = `You are a senior qualitative researcher producing the final aggregate report for a video research study.

You will receive:
- The research topic + the list of questions.
- For each respondent: per-question summaries that already pair words with social-signal observations, and a per-respondent summary.

Return JSON of shape:
{
  "themes": [{
    "title": string,
    "frequency": number,
    "supporting_quotes": string[],
    "sources": [{                                                         // who & where this theme came from — required
      "respondent": string,                                               // e.g. "R2" — must match the respondent label you were given
      "questionPrompt": string,                                           // verbatim from the question list provided
      "quote": string,                                                    // optional verbatim respondent phrase
      "reasoning": string                                                 // 1–2 sentences explaining how this respondent contributed to the theme; reference signals when relevant
    }]
  }],
  "signal_patterns": [{ "description": string, "evidence": string[] }],   // patterns visible across multiple respondents
  "segments": [{ "name": string, "description": string }],
  "recommendations": [{
    "text": string,                                                       // the recommendation itself, one sentence
    "sources": [{                                                         // the cues / respondent moments that motivate it — required
      "respondent": string,
      "questionPrompt": string,
      "quote": string,
      "reasoning": string                                                 // 1–2 sentences linking the moment to the recommendation
    }]
  }],
  "notes_only_visible_via_signals": [{
    "text": string,                                                       // the insight itself, one sentence
    "sources": [{
      "respondent": string,
      "questionPrompt": string,
      "quote": string,
      "reasoning": string                                                 // 1–2 sentences explaining which signals drove this insight and why words alone would have missed it
    }]
  }]
}

Rules:
- "themes", "recommendations", and "notes_only_visible_via_signals" MUST each cite at least one source per entry, with non-empty "respondent", "questionPrompt", and "reasoning".
- "notes_only_visible_via_signals" MUST contain at least one entry when signals exist; flag the value-add of the multimodal read.
- For "notes_only_visible_via_signals" the reasoning must reference the specific signal type(s) (e.g. hesitation, frustration, confidence) that produced the insight.
- "frequency" is the count of respondents who exhibited the theme (not raw mentions).
- "evidence" should reference the signal type and what it implied across respondents.`;

export async function generateResearchSummary(
  researchId: string,
): Promise<ResearchSummaryBody> {
  const research = await prisma.research.findUnique({
    where: { id: researchId },
    include: {
      questions: { orderBy: { order: "asc" } },
      submissions: {
        where: { status: "finished" },
        include: {
          answers: {
            include: { question: true },
            orderBy: { question: { order: "asc" } },
          },
        },
      },
    },
  });
  if (!research) throw new Error("Research not found");

  const respondents = research.submissions.map((s, idx) => ({
    respondent: `R${idx + 1}`,
    headline: (s.summary as { headline?: string } | null)?.headline ?? null,
    submissionSummary: s.summary,
    answers: s.answers.map((a) => ({
      questionId: a.questionId,
      questionPrompt: a.question.prompt,
      summary: a.summary,
      // include 200-char transcript snippet for grounding
      transcriptPreview: (a.transcript ?? "").slice(0, 600),
    })),
  }));

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: RESEARCH_SYSTEM },
      {
        role: "user",
        content: [
          `TOPIC: ${research.topic || research.title}`,
          "",
          "QUESTIONS:",
          JSON.stringify(
            research.questions.map((q) => ({ id: q.id, prompt: q.prompt })),
          ),
          "",
          "RESPONDENTS:",
          JSON.stringify(respondents).slice(0, 28000),
        ].join("\n"),
      },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? "{}";
  let body: ResearchSummaryBody;
  try {
    body = JSON.parse(content) as ResearchSummaryBody;
  } catch {
    body = {
      themes: [],
      signal_patterns: [],
      segments: [],
      recommendations: [content.slice(0, 200)],
      notes_only_visible_via_signals: [] as ResearchSummaryBody["notes_only_visible_via_signals"],
    };
  }

  await prisma.researchSummary.upsert({
    where: { researchId },
    update: { body: body as object, generatedAt: new Date() },
    create: { researchId, body: body as object },
  });

  return body;
}
