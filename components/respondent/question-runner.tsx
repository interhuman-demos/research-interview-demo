"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { uploadInChunks } from "@/lib/uploads/multipart-upload";

import { LiveRecorder, type LiveRecorderHandle } from "./live-recorder";

const SINGLE_SHOT_LIMIT_BYTES = 50 * 1024 * 1024;
const UPLOAD_OUTER_RETRIES = 3;
const UPLOAD_OUTER_BACKOFF_MS = [5_000, 15_000, 45_000];

async function uploadAnswer(
  blob: Blob,
  pathname: string,
  streamSessionId: string,
  streamToken: string,
): Promise<{ url: string }> {
  if (blob.size <= SINGLE_SHOT_LIMIT_BYTES) {
    const res = await fetch(
      `/api/upload?pathname=${encodeURIComponent(pathname)}`,
      {
        method: "POST",
        headers: { "content-type": blob.type || "video/webm" },
        body: blob,
      },
    );
    if (res.ok) return (await res.json()) as { url: string };
    if (res.status !== 413 && res.status < 500) {
      const detail = await res.text().catch(() => "");
      throw new Error(`upload -> ${res.status} ${detail}`);
    }
  }
  return uploadInChunks({
    blob,
    pathname,
    streamSessionId,
    streamToken,
    contentType: blob.type || "video/webm",
  });
}

async function uploadWithRetries(
  blob: Blob,
  pathname: string,
  streamSessionId: string,
  streamToken: string,
): Promise<{ url: string }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < UPLOAD_OUTER_RETRIES; attempt++) {
    try {
      return await uploadAnswer(blob, pathname, streamSessionId, streamToken);
    } catch (err) {
      lastErr = err;
      console.warn(`[upload] attempt ${attempt + 1} failed`, err);
      if (attempt === UPLOAD_OUTER_RETRIES - 1) break;
      await new Promise((r) => setTimeout(r, UPLOAD_OUTER_BACKOFF_MS[attempt]));
    }
  }
  throw lastErr ?? new Error("upload failed");
}

export interface RunnerQuestion {
  id: string;
  prompt: string;
  helperText: string;
  maxSeconds: number;
  answerId: string;
}

interface ConfirmState {
  justAnsweredIndex: number;
  total: number;
  isFinal: boolean;
  leaving: boolean;
}

const CONFIRM_VISIBLE_MS = 1400;
const CONFIRM_FADE_MS = 220;

export function QuestionRunner({
  title,
  submissionId,
  streamSessionId,
  streamToken,
  questions,
}: {
  title: string;
  submissionId: string;
  streamSessionId: string;
  streamToken: string;
  questions: RunnerQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"ready" | "recording">("ready");
  const [pendingCount, setPendingCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const sessionStartRef = useRef<number | null>(null);
  const liveBufferRef = useRef<unknown[]>([]);
  const recorderRef = useRef<LiveRecorderHandle | null>(null);

  const current = questions[index];

  function advanceTo(nextIndex: number) {
    liveBufferRef.current = [];
    setIndex(nextIndex);
  }

  // Once we're on the thank-you screen, wait for any background processing
  // to settle, then mark the submission finished.
  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      if (pendingCount === 0) {
        void fetch(`/api/submission/${submissionId}/finish`, {
          method: "POST",
        });
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [finished, pendingCount, submissionId]);

  async function processAnswerInBackground(
    answer: RunnerQuestion,
    blob: Blob,
    durationMs: number,
    startSec: number,
    liveEnvelopes: unknown[],
  ) {
    setPendingCount((n) => n + 1);
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const path = `submissions/${submissionId}/${answer.id}.${ext}`;
      let blobUrl: string;
      try {
        const result = await uploadWithRetries(
          blob,
          path,
          streamSessionId,
          streamToken,
        );
        blobUrl = result.url;
      } catch (err) {
        console.error("[upload] gave up after retries", err);
        toast.error("Upload failed");
        return;
      }

      let transcript: { text?: string; segments?: unknown } | null = null;
      try {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const form = new FormData();
        form.append(
          "file",
          new File([blob], `answer.${ext}`, {
            type: blob.type || "video/webm",
          }),
        );
        const tres = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });
        if (tres.ok) transcript = await tres.json();
      } catch {
        /* swallow — we still want to PATCH the blob */
      }

      const endSec = startSec + durationMs / 1000;
      try {
        await fetch(`/api/answer/${answer.answerId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            blobUrl,
            durationMs,
            streamSessionId,
            streamToken,
            streamStartSeconds: startSec,
            streamEndSeconds: endSec,
            transcript: transcript?.text ?? null,
            transcriptSegments: transcript ?? null,
            liveEnvelopes,
          }),
        });
      } catch {
        toast.error("Could not save answer");
      }
    } finally {
      setPendingCount((n) => Math.max(0, n - 1));
    }
  }

  function showConfirm(answeredIndex: number, isFinal: boolean) {
    setConfirm({
      justAnsweredIndex: answeredIndex,
      total: questions.length,
      isFinal,
      leaving: false,
    });
    setTimeout(() => {
      setConfirm((c) => (c ? { ...c, leaving: true } : c));
      setTimeout(() => setConfirm(null), CONFIRM_FADE_MS);
    }, CONFIRM_VISIBLE_MS);
  }

  async function handleStop(blob: Blob, durationMs: number) {
    if (!current) return;

    const startSec = sessionStartRef.current ?? 0;
    const endSec = startSec + durationMs / 1000;
    sessionStartRef.current = endSec;

    const envelopes = liveBufferRef.current;
    const answer = current;
    const answeredIndex = index;
    const isFinal = answeredIndex + 1 >= questions.length;

    void processAnswerInBackground(answer, blob, durationMs, startSec, envelopes);

    showConfirm(answeredIndex, isFinal);

    if (isFinal) {
      setFinished(true);
    } else {
      advanceTo(answeredIndex + 1);
    }
    setPhase("ready");
  }

  return (
    <div>
      {confirm ? (
        <ConfirmOverlay state={confirm} title={title} />
      ) : null}

      {finished || index >= questions.length ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-semibold">Thanks for your time</h1>
          <p className="mt-2 text-muted-foreground">
            {pendingCount > 0
              ? `Finalising ${pendingCount} answer${pendingCount === 1 ? "" : "s"} in the background — you can close this tab once it's done.`
              : "We're processing your answers. The researcher will receive your summary shortly."}
          </p>
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {title}
            </p>
            <p className="text-xs text-muted-foreground">
              Question {index + 1} of {questions.length}
            </p>
          </header>

          <h1 className="mt-4 text-2xl font-semibold leading-snug">
            {current.prompt}
          </h1>
          {current.helperText ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {current.helperText}
            </p>
          ) : null}

          <div className="mt-6">
            <LiveRecorder
              ref={recorderRef}
              maxSeconds={current.maxSeconds}
              streamSessionId={streamSessionId}
              streamToken={streamToken}
              onLiveEnvelope={(envelope) => {
                liveBufferRef.current.push(envelope);
              }}
              onPhase={(p) => {
                if (p === "recording" || p === "ready") setPhase(p);
              }}
              onStop={handleStop}
            />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {phase === "ready" ? "Press start when you're ready." : "Recording…"}
            {pendingCount > 0
              ? ` · finalising ${pendingCount} answer${pendingCount === 1 ? "" : "s"} in the background`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}

function ConfirmOverlay({
  state,
  title,
}: {
  state: ConfirmState;
  title: string;
}) {
  const { justAnsweredIndex, total, isFinal, leaving } = state;
  return (
    <div
      data-leaving={leaving}
      className="answer-confirm-backdrop fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md"
    >
      <div className="answer-confirm-card flex flex-col items-center gap-5 px-6 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30">
          <svg
            className="answer-confirm-check h-12 w-12"
            viewBox="0 0 52 52"
            fill="none"
            stroke="currentColor"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 27 L23 36 L39 18" />
          </svg>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Answer {justAnsweredIndex + 1} of {total} saved
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isFinal
              ? "That was the last one — wrapping up."
              : `Next up: question ${justAnsweredIndex + 2} of ${total}`}
          </p>
        </div>
      </div>
    </div>
  );
}
