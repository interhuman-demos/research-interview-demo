"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { StudioChatMessage, StudioQuestion } from "./studio-workspace";

interface ProposedQuestion {
  prompt: string;
  helperText?: string;
  maxSeconds?: number;
}

export function AiChat({
  researchId,
  initialMessages,
  onAccept,
}: {
  researchId: string;
  initialMessages: StudioChatMessage[];
  onAccept: (qs: StudioQuestion[]) => void;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [proposed, setProposed] = useState<ProposedQuestion[]>([]);
  const [pending, start] = useTransition();

  function visibleText(m: StudioChatMessage) {
    if (m.role !== "assistant") return m.content;
    try {
      const parsed = JSON.parse(m.content) as { reply?: string };
      return parsed.reply ?? m.content;
    } catch {
      return m.content;
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium">AI co-pilot</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Tell it your goal. It will propose video-friendly questions you can
        accept with one click.
      </p>

      <ul className="mt-4 max-h-72 space-y-3 overflow-auto pr-1 text-sm">
        {messages.length === 0 ? (
          <li className="text-muted-foreground">
            Try: “I want to understand what stops people in Spain from buying
            an EV.”
          </li>
        ) : (
          messages.map((m) => (
            <li
              key={m.id}
              className={
                m.role === "user"
                  ? "rounded-md bg-muted px-3 py-2"
                  : "rounded-md border border-border px-3 py-2"
              }
            >
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {m.role}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{visibleText(m)}</p>
            </li>
          ))
        )}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = input.trim();
          if (!trimmed) return;
          const userMsg: StudioChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: trimmed,
          };
          setMessages((p) => [...p, userMsg]);
          setInput("");
          start(async () => {
            const res = await fetch(
              `/api/research/${researchId}/draft-questions`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: trimmed }),
              },
            );
            if (!res.ok) {
              toast.error("AI co-pilot failed");
              return;
            }
            const data = (await res.json()) as {
              reply: string;
              proposed_questions: ProposedQuestion[];
            };
            setMessages((p) => [
              ...p,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: JSON.stringify(data),
              },
            ]);
            setProposed(data.proposed_questions ?? []);
          });
        }}
        className="mt-4 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Ask for question ideas, or refine what you have…"
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {pending ? "Thinking…" : "Send"}
        </button>
      </form>

      {proposed.length > 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-border p-4">
          <p className="text-sm font-medium">Proposed questions</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
            {proposed.map((q, i) => (
              <li key={i}>
                <span>{q.prompt}</span>
                {q.helperText ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {q.helperText}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onAccept(proposed);
                setProposed([]);
                toast.success(`Added ${proposed.length} questions`);
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
            >
              Add all
            </button>
            <button
              type="button"
              onClick={() => setProposed([])}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
