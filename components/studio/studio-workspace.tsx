"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { TopicForm } from "./topic-form";
import { AiChat } from "./ai-chat";
import { QuestionList } from "./question-list";
import { ShareCard } from "./share-card";

export interface StudioQuestion {
  id?: string;
  prompt: string;
  helperText?: string;
  maxSeconds?: number;
}

export interface StudioChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StudioResearch {
  id: string;
  slug: string;
  title: string;
  topic: string;
  status: "draft" | "live" | "closed";
  questions: StudioQuestion[];
  chatMessages: StudioChatMessage[];
}

export function StudioWorkspace({
  initialResearch,
}: {
  initialResearch: StudioResearch;
}) {
  const [research, setResearch] = useState<StudioResearch>(initialResearch);
  const [saving, setSaving] = useState(false);

  // Serialize PATCHes so concurrent edits don't deadlock on the question rows.
  // We coalesce intermediate writes: if N updates queue while one is in flight,
  // we only send the latest snapshot once it completes.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef<
    (Partial<StudioResearch> & { questions?: StudioQuestion[] }) | null
  >(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function flushPatch() {
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    setSaving(true);
    try {
      const res = await fetch(`/api/research/${research.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        toast.error(body?.error ?? "Save failed");
        return;
      }
      const data = (await res.json()) as { research: StudioResearch };
      setResearch((prev) => ({
        ...prev,
        ...next,
        questions: data.research.questions ?? prev.questions,
      }));
    } finally {
      setSaving(false);
    }
    // If more changes accumulated while we were saving, drain them.
    if (pendingRef.current) {
      await flushPatch();
    }
  }

  function patch(
    next: Partial<StudioResearch> & { questions?: StudioQuestion[] },
    options: { debounceMs?: number } = {},
  ) {
    pendingRef.current = { ...(pendingRef.current ?? {}), ...next };
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trigger = () => {
      debounceRef.current = null;
      if (inFlightRef.current) return; // current flight will drain pendingRef
      inFlightRef.current = flushPatch().finally(() => {
        inFlightRef.current = null;
      });
    };

    if (options.debounceMs && options.debounceMs > 0) {
      debounceRef.current = setTimeout(trigger, options.debounceMs);
    } else {
      trigger();
    }
  }

  function appendQuestions(qs: StudioQuestion[]) {
    const merged = [...research.questions, ...qs];
    patch({ questions: merged });
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <header>
          <input
            value={research.title}
            onChange={(e) =>
              setResearch((p) => ({ ...p, title: e.target.value }))
            }
            onBlur={() => patch({ title: research.title })}
            className="w-full bg-transparent text-3xl font-semibold outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Status: {research.status} · {saving ? "saving…" : "saved"}
          </p>
        </header>

        <TopicForm
          value={research.topic}
          onChange={(topic) =>
            setResearch((p) => ({ ...p, topic }))
          }
          onCommit={() => patch({ topic: research.topic })}
        />

        <AiChat
          researchId={research.id}
          initialMessages={research.chatMessages}
          onAccept={appendQuestions}
        />
      </div>

      <div className="space-y-6">
        <ShareCard
          slug={research.slug}
          status={research.status}
          onStatusChange={(status) => patch({ status })}
        />
        <QuestionList
          questions={research.questions}
          onChange={(questions, kind) => {
            setResearch((p) => ({ ...p, questions }));
            patch(
              { questions },
              { debounceMs: kind === "edit" ? 600 : 0 },
            );
          }}
        />
      </div>
    </div>
  );
}
