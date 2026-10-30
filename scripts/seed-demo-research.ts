/**
 * One-shot seed: a Research with 5 questions and 5 finished Submissions.
 * Writes synthetic transcripts + Interhuman-style signal envelopes + per-answer
 * and per-submission summaries directly via Prisma, then asks the running dev
 * server to generate the aggregate ResearchSummary (which hits OpenAI).
 *
 *   pnpm tsx scripts/seed-demo-research.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

import type { SignalType, SignalProbability } from "../lib/interhuman/types";

const prisma = new PrismaClient();

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DEMO_USER_EMAIL = "demo@research-interview.local";
const DEMO_USER_NAME = "Demo Researcher";

interface RespondentProfile {
  nickname: string;
  // bias toward certain signal types so the cohort distribution has shape
  bias: SignalType[];
}

const PROFILES: RespondentProfile[] = [
  { nickname: "Alex",   bias: ["engagement", "agreement", "interest"] },
  { nickname: "Priya",  bias: ["hesitation", "uncertainty", "stress"] },
  { nickname: "Marcus", bias: ["skepticism", "disagreement", "confidence"] },
  { nickname: "Yuki",   bias: ["confusion", "hesitation", "interest"] },
  { nickname: "Sofia",  bias: ["engagement", "confidence", "agreement"] },
];

const QUESTIONS = [
  {
    prompt: "Walk me through the last time you made a major purchase online — what stood out about the experience?",
    helperText: "Anything from the moment you started looking to checkout.",
  },
  {
    prompt: "When you're shopping online, what makes you trust a brand you've never bought from before?",
    helperText: "",
  },
  {
    prompt: "Tell me about a time an online checkout frustrated you. What happened, and what did you do?",
    helperText: "",
  },
  {
    prompt: "How do reviews and ratings influence your decision — be honest, do you actually read them?",
    helperText: "",
  },
  {
    prompt: "If you could change one thing about how online shopping works today, what would it be?",
    helperText: "",
  },
];

// Pre-baked per-answer responses, keyed by [profile][question]
// Each carries: a short transcript, a signal mix biased to the profile,
// and a per-answer summary that mirrors the AnswerSummary shape.
const ANSWER_CONTENT: Record<
  string,
  {
    transcript: string;
    extraSignals: SignalType[];
    gist: string;
    verbal_themes: string[];
    nonverbal: string[];
    tension?: string[];
    quotes: { text: string; reason: string }[];
  }[]
> = {
  Alex: [
    {
      transcript:
        "I bought a pair of running shoes last month. The site had really clean photos, and I liked that they showed someone actually wearing them. Checkout was fast, and they emailed me a tracking number within an hour. Honestly the whole thing felt easy.",
      extraSignals: ["engagement"],
      gist: "Recent purchase felt frictionless; visual merchandising and fast confirmation drove confidence.",
      verbal_themes: ["clean visuals", "fast confirmation", "smooth checkout"],
      nonverbal: ["sustained high engagement throughout the answer", "agreement spike when describing the tracking email"],
      quotes: [{ text: "the whole thing felt easy", reason: "captures the emotional payoff" }],
    },
    {
      transcript:
        "I look at the site itself first — does it look professional? Then reviews, definitely. And if there's a clear return policy, that pretty much seals it for me.",
      extraSignals: ["agreement", "confidence"],
      gist: "Trust comes from a polished site, reviews, and a visible return policy.",
      verbal_themes: ["professional design", "reviews", "return policy"],
      nonverbal: ["confidence signal when mentioning return policy"],
      quotes: [{ text: "if there's a clear return policy, that pretty much seals it", reason: "trust trigger" }],
    },
    {
      transcript:
        "Probably the worst was when a checkout kept rejecting my card with no explanation. I tried twice and just left. Bought it on Amazon instead.",
      extraSignals: ["frustration"],
      gist: "Opaque payment errors caused immediate switch to a competitor.",
      verbal_themes: ["payment failure", "no error message", "switched to Amazon"],
      nonverbal: ["short frustration burst when describing the rejection"],
      quotes: [{ text: "I tried twice and just left", reason: "speed of abandonment" }],
    },
    {
      transcript:
        "Yeah, I read them. Especially the three-star ones, because those people usually explain what was good and what wasn't. Five-star reviews feel performative.",
      extraSignals: ["interest", "agreement"],
      gist: "Skews toward mid-rating reviews for credibility.",
      verbal_themes: ["mid-rating preference", "skepticism of 5-star"],
      nonverbal: ["interest signal during the three-star explanation"],
      quotes: [{ text: "five-star reviews feel performative", reason: "specific, quotable take" }],
    },
    {
      transcript:
        "I'd want sizing to actually be standard. Every brand has its own thing and it's exhausting. Just one chart, one truth.",
      extraSignals: ["engagement"],
      gist: "Wants a universal sizing standard across brands.",
      verbal_themes: ["sizing inconsistency", "fatigue with returns"],
      nonverbal: ["high engagement when describing the frustration"],
      quotes: [{ text: "one chart, one truth", reason: "memorable phrasing" }],
    },
  ],
  Priya: [
    {
      transcript:
        "Um, I think the last time was a, uh, a winter coat. I wasn't sure about the size. I read a lot of reviews. I think I went back to the page, like, three times before I actually clicked buy.",
      extraSignals: ["hesitation", "uncertainty"],
      gist: "Repeated returns to the product page suggest uncertainty driven by sizing risk.",
      verbal_themes: ["sizing anxiety", "review-heavy research"],
      nonverbal: ["hesitation signals throughout", "uncertainty spike at the moment of describing the purchase decision"],
      tension: ["she said the experience was fine but signals showed sustained hesitation"],
      quotes: [{ text: "three times before I actually clicked buy", reason: "concrete behavior pointing to friction" }],
    },
    {
      transcript:
        "I think… reviews mostly. And, uh, if a friend mentioned it. I'm a little wary of new brands.",
      extraSignals: ["hesitation"],
      gist: "Trust is borrowed — from reviews and word of mouth.",
      verbal_themes: ["social proof", "wariness of new brands"],
      nonverbal: ["hesitation when describing wariness"],
      quotes: [{ text: "I'm a little wary of new brands", reason: "captures cautious posture" }],
    },
    {
      transcript:
        "Yeah, this happened recently — there was a, like, mandatory account creation step and I just couldn't be bothered. I closed the tab. It made me kind of stressed actually.",
      extraSignals: ["stress", "frustration"],
      gist: "Forced account creation triggered stress and abandonment.",
      verbal_themes: ["forced account creation", "tab close"],
      nonverbal: ["stress spike when describing the account wall"],
      quotes: [{ text: "it made me kind of stressed actually", reason: "explicit emotion verbalised" }],
    },
    {
      transcript:
        "I, um, I do read them. Maybe too much. Sometimes I'll read for an hour and still not buy.",
      extraSignals: ["uncertainty", "hesitation"],
      gist: "Heavy review consumption sometimes prevents a decision.",
      verbal_themes: ["analysis paralysis"],
      nonverbal: ["uncertainty across the answer"],
      quotes: [{ text: "an hour and still not buy", reason: "decision paralysis" }],
    },
    {
      transcript:
        "I'd want, um, more honest photos. Real people, not models. The gap between what I see and what arrives is, like, kind of the whole problem.",
      extraSignals: ["agreement", "hesitation"],
      gist: "Mismatch between marketing imagery and real product is the core complaint.",
      verbal_themes: ["honest photos", "expectation gap"],
      nonverbal: ["hesitant delivery despite a clear opinion"],
      quotes: [{ text: "the gap between what I see and what arrives", reason: "expectation/reality framing" }],
    },
  ],
  Marcus: [
    {
      transcript:
        "Most recent? Probably a monitor. I compared three sites. The one I bought from wasn't the cheapest, but their warranty terms were better. I don't trust the cheap ones.",
      extraSignals: ["skepticism", "confidence"],
      gist: "Chose based on warranty over price; explicitly distrustful of cheapest options.",
      verbal_themes: ["warranty over price", "comparison shopping"],
      nonverbal: ["skepticism signals when discussing cheap options", "confidence when explaining the warranty rationale"],
      quotes: [{ text: "I don't trust the cheap ones", reason: "decision driver" }],
    },
    {
      transcript:
        "Honestly? I don't trust most brands until I've used them. Marketing is marketing. I'd rather see a deep-dive review from someone independent.",
      extraSignals: ["skepticism", "disagreement"],
      gist: "Default skepticism; trust requires third-party validation.",
      verbal_themes: ["distrust of marketing", "independent reviews"],
      nonverbal: ["sustained skepticism throughout"],
      quotes: [{ text: "marketing is marketing", reason: "blunt framing" }],
    },
    {
      transcript:
        "Surprise shipping fees at the end. Massive pet peeve. If I see that I'm out, even if I've already filled the cart. It feels like a bait and switch.",
      extraSignals: ["frustration", "disagreement"],
      gist: "Shipping fees revealed late = immediate abandonment + trust damage.",
      verbal_themes: ["surprise fees", "bait and switch"],
      nonverbal: ["frustration spike at the words 'bait and switch'"],
      quotes: [{ text: "it feels like a bait and switch", reason: "strong language signals depth of feeling" }],
    },
    {
      transcript:
        "I read them but I weight them. One bad review with a real story beats fifty 'great product!' ones. The pattern matters more than the rating.",
      extraSignals: ["confidence", "agreement"],
      gist: "Reads patterns and substance, not just ratings.",
      verbal_themes: ["pattern over rating", "substance over score"],
      nonverbal: ["confidence throughout"],
      quotes: [{ text: "the pattern matters more than the rating", reason: "concise framing" }],
    },
    {
      transcript:
        "Force the actual all-in price up front. Tax, shipping, fees — show it on the product page, not the last step.",
      extraSignals: ["confidence", "agreement"],
      gist: "Wants total cost transparency on the product page itself.",
      verbal_themes: ["all-in pricing", "fee transparency"],
      nonverbal: ["sustained confidence"],
      quotes: [{ text: "show it on the product page, not the last step", reason: "specific design ask" }],
    },
  ],
  Yuki: [
    {
      transcript:
        "I bought a desk chair. The page was, um, kind of confusing — there were three versions and I wasn't sure which was the one in the photos. I picked the middle one and hoped.",
      extraSignals: ["confusion", "hesitation"],
      gist: "Ambiguous product variants forced a guess.",
      verbal_themes: ["unclear variants", "guesswork"],
      nonverbal: ["confusion spike when describing the variants"],
      tension: ["positive words ('hoped') but signals show clear confusion and hesitation"],
      quotes: [{ text: "I picked the middle one and hoped", reason: "decision under ambiguity" }],
    },
    {
      transcript:
        "When the website is, like, well-designed, I think — okay, they care. And reviews. And if customer service responds quickly when I email them.",
      extraSignals: ["interest", "agreement"],
      gist: "Trust signals: design quality, reviews, responsive support.",
      verbal_themes: ["design quality", "responsive support"],
      nonverbal: ["interest signal throughout"],
      quotes: [{ text: "okay, they care", reason: "humanises the trust judgement" }],
    },
    {
      transcript:
        "I had this thing where the cart kept emptying when I, uh, when I logged in. Like, why? I had to add everything twice. I was confused, then annoyed.",
      extraSignals: ["confusion", "frustration"],
      gist: "Cart-on-login wipe caused confusion that escalated to frustration.",
      verbal_themes: ["cart loss on login", "rebuilding the cart"],
      nonverbal: ["confusion shifting to frustration over the answer"],
      quotes: [{ text: "I was confused, then annoyed", reason: "emotional progression" }],
    },
    {
      transcript:
        "Yeah I read them. I usually sort by most recent because, um, products change. An old five-star review might be about a different version.",
      extraSignals: ["interest", "confidence"],
      gist: "Sorts reviews by recency to account for product drift.",
      verbal_themes: ["recency", "product drift"],
      nonverbal: ["confidence when explaining the recency strategy"],
      quotes: [{ text: "an old five-star review might be about a different version", reason: "sophisticated take" }],
    },
    {
      transcript:
        "I'd want, um, better photos of size. Like, next to a hand or, you know, a cup. Just so I know how big it actually is.",
      extraSignals: ["interest", "hesitation"],
      gist: "Wants in-context scale references in product photography.",
      verbal_themes: ["scale reference", "in-context photos"],
      nonverbal: ["hesitation while formulating, interest while describing the desired feature"],
      quotes: [{ text: "next to a hand or, you know, a cup", reason: "concrete UX suggestion" }],
    },
  ],
  Sofia: [
    {
      transcript:
        "I bought a kitchen mixer last week. I knew the brand. The site loaded fast, the photos were great, and they had a 30-day return policy front and center. Done deal.",
      extraSignals: ["engagement", "confidence", "agreement"],
      gist: "Known brand + fast site + visible return policy = quick decisive purchase.",
      verbal_themes: ["brand familiarity", "site performance", "visible return policy"],
      nonverbal: ["high engagement and confidence throughout"],
      quotes: [{ text: "done deal", reason: "punchy summary of the decision" }],
    },
    {
      transcript:
        "Brand reputation, mostly. And reviews. If a brand has been around and the reviews are consistent, I'll buy without hesitating.",
      extraSignals: ["confidence", "agreement"],
      gist: "Trust = reputation × review consistency.",
      verbal_themes: ["brand reputation", "review consistency"],
      nonverbal: ["confidence signal sustained"],
      quotes: [{ text: "I'll buy without hesitating", reason: "describes the conversion threshold" }],
    },
    {
      transcript:
        "Ages ago I had a checkout that just spun forever. I refreshed, my cart was empty, I was annoyed but I rebuilt it. I really wanted that thing.",
      extraSignals: ["frustration", "engagement"],
      gist: "High-intent shopper pushed through a checkout failure.",
      verbal_themes: ["spinning checkout", "high purchase intent"],
      nonverbal: ["frustration at the failure but engagement at the recovery"],
      quotes: [{ text: "I really wanted that thing", reason: "intent overrode friction" }],
    },
    {
      transcript:
        "Always. I read the bad ones first to see if there's a deal-breaker. Then the good ones for confidence. It's almost a ritual.",
      extraSignals: ["engagement", "interest"],
      gist: "Has a deliberate review-reading routine.",
      verbal_themes: ["bad-then-good pattern", "ritual"],
      nonverbal: ["engagement spike when calling it a ritual"],
      quotes: [{ text: "it's almost a ritual", reason: "behavioral framing" }],
    },
    {
      transcript:
        "Make returns truly free and instant. The fear of being stuck with the wrong thing is what stops me from buying more.",
      extraSignals: ["agreement", "confidence"],
      gist: "Wants instant, free returns to remove purchase risk.",
      verbal_themes: ["return friction", "purchase fear"],
      nonverbal: ["confidence and agreement"],
      quotes: [{ text: "the fear of being stuck", reason: "names the underlying anxiety" }],
    },
  ],
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickProbability(): SignalProbability {
  const r = Math.random();
  if (r < 0.5) return "high";
  if (r < 0.85) return "medium";
  return "low";
}

interface BuiltAnswer {
  transcript: string;
  transcriptSegments: { segments: { id: number; start: number; end: number; text: string }[] };
  signals: { type: "signal.detected"; timestamp: string; correlation_id: string; data: { signal_type: SignalType; start: number; end: number; probability: SignalProbability } }[];
  engagement: { type: "engagement.updated"; timestamp: string; correlation_id: string; data: { start: number; end: number; state: string; score: number } }[];
  durationMs: number;
  streamStartSeconds: number;
  streamEndSeconds: number;
  answerSummary: object;
}

function buildAnswer(
  profile: RespondentProfile,
  qIndex: number,
  baseStreamSec: number,
  correlationId: string,
): BuiltAnswer {
  const content = ANSWER_CONTENT[profile.nickname][qIndex];
  // Synthesize a transcript split into 3-5 segments.
  const sentences = content.transcript.split(/(?<=[.!?])\s+/).filter(Boolean);
  const totalSec = Math.min(60, Math.max(18, sentences.length * 5 + Math.random() * 6));
  const durationMs = Math.round(totalSec * 1000);
  const streamEnd = baseStreamSec + totalSec;
  const segDur = totalSec / sentences.length;
  const segments = sentences.map((text, i) => ({
    id: i,
    start: +(i * segDur).toFixed(2),
    end: +((i + 1) * segDur).toFixed(2),
    text: text.trim(),
  }));

  const signalPool: SignalType[] = [...profile.bias, ...content.extraSignals];
  // Sprinkle 4-9 signals across the answer
  const signalCount = 4 + Math.floor(Math.random() * 6);
  const signals: BuiltAnswer["signals"] = [];
  for (let i = 0; i < signalCount; i++) {
    const t = signalPool[Math.floor(Math.random() * signalPool.length)];
    const sLocal = randomBetween(0.5, Math.max(1, totalSec - 2));
    const eLocal = sLocal + randomBetween(0.6, 2.2);
    signals.push({
      type: "signal.detected",
      timestamp: new Date(Date.now() - Math.random() * 60_000).toISOString(),
      correlation_id: correlationId,
      data: {
        signal_type: t,
        start: +(baseStreamSec + sLocal).toFixed(2),
        end: +(baseStreamSec + Math.min(totalSec, eLocal)).toFixed(2),
        probability: pickProbability(),
      },
    });
  }
  // Engagement envelopes — 2-3 windows with state transitions
  const states = ["focused", "neutral", "drifting"];
  const windowCount = 2 + Math.floor(Math.random() * 2);
  const engagement: BuiltAnswer["engagement"] = [];
  for (let i = 0; i < windowCount; i++) {
    const wStart = baseStreamSec + (i * totalSec) / windowCount;
    const wEnd = baseStreamSec + ((i + 1) * totalSec) / windowCount;
    engagement.push({
      type: "engagement.updated",
      timestamp: new Date().toISOString(),
      correlation_id: correlationId,
      data: {
        start: +wStart.toFixed(2),
        end: +wEnd.toFixed(2),
        state: states[Math.floor(Math.random() * states.length)],
        score: +randomBetween(0.4, 0.95).toFixed(2),
      },
    });
  }

  return {
    transcript: content.transcript,
    transcriptSegments: { segments },
    signals,
    engagement,
    durationMs,
    streamStartSeconds: +baseStreamSec.toFixed(2),
    streamEndSeconds: +streamEnd.toFixed(2),
    answerSummary: {
      gist: content.gist,
      verbal_themes: content.verbal_themes,
      nonverbal_observations: content.nonverbal,
      tension_points: content.tension ?? [],
      quotes: content.quotes,
    },
  };
}

function countSignals(
  signals: { data: { signal_type: SignalType } }[],
): { type: SignalType; count: number }[] {
  const counts = new Map<SignalType, number>();
  for (const s of signals) {
    counts.set(s.data.signal_type, (counts.get(s.data.signal_type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count }));
}

async function main() {
  // 1. Demo user
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME },
  });

  // 2. Research + questions
  const slug = `online-shopping-trust-${nanoid(6).toLowerCase()}`;
  const research = await prisma.research.create({
    data: {
      slug,
      title: "Online shopping trust & checkout friction",
      topic: "What earns shopper trust online and what causes them to abandon checkouts.",
      description:
        "Five short questions probing recent purchases, trust drivers, checkout failures, review behavior, and one wished-for change. Used as the demo dataset for the aggregate summary screen.",
      status: "live",
      creatorId: user.id,
      questions: {
        create: QUESTIONS.map((q, i) => ({
          order: i,
          prompt: q.prompt,
          helperText: q.helperText,
          maxSeconds: 90,
        })),
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  console.log(`Research created: ${research.id} (slug=${research.slug})`);

  // 3. Submissions
  for (const profile of PROFILES) {
    const streamSessionId = `seed-${nanoid(10)}`;
    const correlationId = nanoid(12);
    const submission = await prisma.submission.create({
      data: {
        researchId: research.id,
        respondentNickname: profile.nickname,
        userAgent: "seed-script",
        streamSessionId,
        status: "finished",
        finishedAt: new Date(),
      },
    });

    let cursor = 0;
    const allSignals: BuiltAnswer["signals"] = [];
    const perQuestion: { questionId: string; gist: string; dominant_signals: SignalType[] }[] = [];
    for (let qIdx = 0; qIdx < research.questions.length; qIdx++) {
      const q = research.questions[qIdx];
      const built = buildAnswer(profile, qIdx, cursor, correlationId);
      cursor = built.streamEndSeconds + 1.5; // small inter-question gap

      await prisma.answer.create({
        data: {
          submissionId: submission.id,
          questionId: q.id,
          blobUrl: null, // no actual recording in seeded data
          durationMs: built.durationMs,
          streamSessionId,
          streamStartSeconds: built.streamStartSeconds,
          streamEndSeconds: built.streamEndSeconds,
          transcript: built.transcript,
          transcriptSegments: built.transcriptSegments,
          signals: built.signals,
          engagement: built.engagement,
          conversationQuality: null,
          correlationId,
          summary: built.answerSummary,
        },
      });
      allSignals.push(...built.signals);

      const dominantCounts = countSignals(built.signals).sort((a, b) => b.count - a.count);
      perQuestion.push({
        questionId: q.id,
        gist: (built.answerSummary as { gist: string }).gist,
        dominant_signals: dominantCounts.slice(0, 3).map((d) => d.type),
      });
    }

    // Per-submission summary mirroring SubmissionSummary shape
    const headline = ({
      Alex: "Confident, time-efficient shopper who reads polish and clarity as trust signals.",
      Priya: "Cautious, review-heavy shopper for whom uncertainty is the dominant emotional state.",
      Marcus: "Skeptical pragmatist who treats marketing as noise and pricing transparency as table stakes.",
      Yuki: "Detail-oriented shopper repeatedly tripped up by ambiguous product information and UX inconsistencies.",
      Sofia: "Decisive, brand-loyal shopper whose intent overcomes most checkout friction.",
    } as Record<string, string>)[profile.nickname];
    const arc = ({
      Alex: "Engagement stays high throughout; mild frustration only when describing past failures.",
      Priya: "Hesitation and uncertainty dominate, with stress spikes around forced UX patterns.",
      Marcus: "Steady skepticism with bursts of confidence when articulating his decision rules.",
      Yuki: "Confusion early, settling into measured interest as she discusses her own coping strategies.",
      Sofia: "High engagement throughout, with brief frustration when narrating a past bad checkout.",
    } as Record<string, string>)[profile.nickname];

    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        summary: {
          headline,
          per_question: perQuestion,
          engagement_arc: arc,
          signal_distribution: countSignals(allSignals),
        },
      },
    });

    console.log(`  · Submission for ${profile.nickname}: ${submission.id} (${allSignals.length} signals)`);
  }

  // 4. Trigger the aggregate summary via the running dev server's API
  console.log(`\nGenerating aggregate summary via ${APP_URL}…`);
  const res = await fetch(`${APP_URL}/api/research/${research.id}/summary`, {
    method: "POST",
  });
  if (!res.ok) {
    console.error(
      `  ✗ POST /api/research/${research.id}/summary -> ${res.status} ${res.statusText}`,
    );
    console.error(await res.text());
  } else {
    console.log(`  ✓ Aggregate summary generated`);
  }

  console.log("\nOpen:");
  console.log(`  Studio:      ${APP_URL}/studio/${research.id}`);
  console.log(`  Submissions: ${APP_URL}/studio/${research.id}/submissions`);
  console.log(`  Summary:     ${APP_URL}/studio/${research.id}/summary`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
