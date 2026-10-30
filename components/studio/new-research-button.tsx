"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function NewResearchButton() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        start(async () => {
          const res = await fetch("/api/research", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: trimmed }),
          });
          if (!res.ok) {
            toast.error("Could not create research");
            return;
          }
          const data = (await res.json()) as { research: { id: string } };
          router.push(`/studio/${data.research.id}`);
        });
      }}
      className="flex items-center gap-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Name a new research, e.g. EV adoption in Europe"
        className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
      />
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {pending ? "Creating…" : "New research"}
      </button>
    </form>
  );
}
