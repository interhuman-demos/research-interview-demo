"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

const subscribe = () => () => {};
const getServerOrigin = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const getClientOrigin = () =>
  typeof window === "undefined" ? getServerOrigin() : window.location.origin;

export function ShareCard({
  slug,
  status,
  onStatusChange,
}: {
  slug: string;
  status: "draft" | "live" | "closed";
  onStatusChange: (s: "draft" | "live" | "closed") => void;
}) {
  const origin = useSyncExternalStore(subscribe, getClientOrigin, getServerOrigin);
  const url = `${origin}/r/${slug}`;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium">Share with respondents</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Toggle live to allow respondents through this link.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success("Link copied");
          }}
          className="rounded-md border border-border px-3 py-2 text-xs"
        >
          Copy
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(["draft", "live", "closed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStatusChange(s)}
            className={
              "rounded-full border px-3 py-1 text-xs capitalize " +
              (status === s
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
