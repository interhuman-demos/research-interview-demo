# Research Interview Demo

Listen Labs–style video research tool. Researcher signs in, defines a topic,
drafts questions with an AI co-pilot, shares a public link. Respondents answer
on camera; each answer is streamed live to **Interhuman** for social-signal
analysis (`wss://api.interhuman.ai/v1/stream/analyze`) and post-recording
transcribed by **OpenAI Whisper**. Per-submission and aggregate summaries fold
both signals (the *how*) and transcripts (the *what*) into one report.

## Stack

- Next.js 16 (App Router) · React 19 · Tailwind 4
- Postgres via Prisma · NextAuth v5 (Google) · Vercel Blob
- OpenAI (chat for the co-pilot, Whisper for transcripts, GPT for summaries)
- Interhuman v1 streaming WebSocket (relayed server-side; SSE to the client)

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # then fill in the keys
pnpm prisma migrate dev            # creates tables
pnpm dev
```

Required env vars (see `.env.local.example`): `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `OPENAI_API_KEY`, `INTERHUMAN_API_KEY`,
`BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_APP_URL`.

## Routes

Researcher (auth-gated):
- `/dashboard` — research list + create
- `/studio/[id]` — topic, AI chat, question list, share link, live-toggle
- `/studio/[id]/submissions` — list, `/[subId]` — per-answer player + summary
- `/studio/[id]/summary` — aggregate research summary

Respondent (no login):
- `/r/[slug]` — landing/consent
- `/r/[slug]/run?s=…&ss=…&st=…` — question-by-question recorder

API:
- `/api/stream` — POST chunk to Interhuman, GET SSE for envelopes
- `/api/upload` — Vercel Blob token handler
- `/api/transcribe` — Whisper (`verbose_json` with segment timestamps)
- `/api/research`, `/api/research/[id]` (+`draft-questions`, `summary`)
- `/api/research/by-slug/[slug]` — public read for respondents
- `/api/submission` (start), `/api/submission/[id]/finish`, `/[id]/summary`
- `/api/answer/[id]` — PATCH the recording's blob/transcript/signals

## Manual end-to-end verification

1. Sign in with Google, create a research, chat with the co-pilot, accept
   proposed questions, flip to **live**, copy the share link.
2. Open the share link in a private window, record 2–3 short answers.
3. While recording, the live "signals" badges should update — that's SSE
   relaying envelopes from the upstream Interhuman WS.
4. Open the submission in the studio. Each answer should show a video,
   a colored signal timeline, the transcript, and a summary that mentions
   *both* what the respondent said and what the social signals showed.
5. Generate the aggregate summary. The
   `notes_only_visible_via_signals` field should be non-empty when there's
   any meaningful signal density across submissions — that's the demo's
   value prop made legible in the output.

## Notes on the streaming pipeline

- The browser records WebM with VP9/Opus at a 5s timeslice. The first chunk
  contains the WebM init segment (Cluster element marker `0x1F43B675`); we
  split it client-side (`lib/interhuman/webm-segment.ts`) and prepend it to
  every subsequent chunk so each is a valid standalone WebM. Without that,
  the upstream API rejects mid-stream chunks.
- One Interhuman session is opened per **submission** (not per question), so
  signal timestamps are absolute session-cumulative seconds. We record
  `streamStartSeconds`/`streamEndSeconds` per `Answer` to slice signals back
  into per-question buckets at PATCH time.
- Whisper is called **after** stop, on the assembled per-answer WebM. We use
  `verbose_json` so each segment has `start`/`end` and we can build an
  annotated transcript that overlays signals onto Whisper segments
  (`lib/summary/annotate.ts`).
