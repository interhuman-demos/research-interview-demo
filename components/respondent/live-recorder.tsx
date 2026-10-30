"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Camera, Circle, Loader2, Square } from "lucide-react";

import {
  MIN_RECORD_DURATION_MS,
  RECORD_TIMESLICE_MS,
  VIDEO_CONSTRAINTS,
  buildRecorderOptions,
} from "@/lib/recording";
import {
  extractInitSegment,
  prependInitSegment,
} from "@/lib/interhuman/webm-segment";
import { cn } from "@/lib/utils";

type Phase =
  | "ready"
  | "recording"
  | "uploading"
  | "transcribing"
  | "saving"
  | "done";

export interface LiveRecorderHandle {
  stop: () => void;
}

interface Props {
  maxSeconds: number;
  streamSessionId: string;
  streamToken: string;
  onLiveEnvelope: (envelope: unknown) => void;
  onPhase: (p: Phase) => void;
  onStop: (blob: Blob, durationMs: number) => Promise<void> | void;
  className?: string;
}

export const LiveRecorder = forwardRef<LiveRecorderHandle, Props>(
  function LiveRecorder(
    {
      maxSeconds,
      streamSessionId,
      streamToken,
      onLiveEnvelope,
      onPhase,
      onStop,
      className,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const initSegRef = useRef<Uint8Array | null>(null);
    const startedAtRef = useRef<number>(0);
    const eventSourceRef = useRef<EventSource | null>(null);
    const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [status, setStatus] = useState<
      "idle" | "requesting" | "ready" | "recording" | "stopping" | "error"
    >("idle");
    const [error, setError] = useState<string | null>(null);
    const [elapsedMs, setElapsedMs] = useState(0);

    const closeStream = useCallback(() => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }, []);

    const requestCamera = useCallback(async () => {
      setStatus("requesting");
      setError(null);
      try {
        const s = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("ready");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not access webcam",
        );
        setStatus("error");
      }
    }, []);

    const ensureSse = useCallback(() => {
      if (eventSourceRef.current) return;
      const url = new URL("/api/stream", window.location.origin);
      url.searchParams.set("sessionId", streamSessionId);
      url.searchParams.set("token", streamToken);
      const es = new EventSource(url.toString());
      es.onmessage = (e) => {
        try {
          onLiveEnvelope(JSON.parse(e.data));
        } catch {
          /* noop */
        }
      };
      es.onerror = () => {
        // Browser will auto-reconnect; nothing to do.
      };
      eventSourceRef.current = es;
    }, [onLiveEnvelope, streamSessionId, streamToken]);

    async function forwardChunk(chunk: Blob) {
      if (chunk.size === 0) return;
      let toSend: Blob = chunk;
      if (!initSegRef.current) {
        const init = await extractInitSegment(chunk);
        if (init) {
          initSegRef.current = init;
          toSend = chunk; // first chunk includes the init bytes already
        }
      } else {
        const buf = new Uint8Array(await chunk.arrayBuffer());
        const merged = prependInitSegment(initSegRef.current, buf);
        toSend = new Blob([new Uint8Array(merged)], { type: "video/webm" });
      }
      try {
        await fetch("/api/stream", {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            "x-stream-session-id": streamSessionId,
            "x-stream-token": streamToken,
          },
          body: toSend,
        });
      } catch {
        /* noop */
      }
    }

    const stop = useCallback(() => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        setStatus("stopping");
        recorderRef.current.stop();
      }
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      autoStopRef.current = null;
      tickRef.current = null;
    }, []);

    useImperativeHandle(ref, () => ({ stop }), [stop]);

    const start = useCallback(() => {
      const s = streamRef.current;
      if (!s) return;
      ensureSse();
      const recorder = new MediaRecorder(s, buildRecorderOptions());
      chunksRef.current = [];
      initSegRef.current = null;
      recorder.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        chunksRef.current.push(e.data);
        void forwardChunk(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const dur = Date.now() - startedAtRef.current;
        // Keep the camera/mic alive so the next question starts instantly.
        setStatus("ready");
        onPhase("ready");
        await onStop(blob, dur);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      recorder.start(RECORD_TIMESLICE_MS);
      setStatus("recording");
      onPhase("recording");

      autoStopRef.current = setTimeout(stop, maxSeconds * 1000);
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    }, [closeStream, ensureSse, maxSeconds, onPhase, onStop, stop]);

    useEffect(() => {
      return () => {
        if (autoStopRef.current) clearTimeout(autoStopRef.current);
        if (tickRef.current) clearInterval(tickRef.current);
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        closeStream();
      };
    }, [closeStream]);

    const maxMs = maxSeconds * 1000;
    const remainingSec = Math.max(0, Math.ceil((maxMs - elapsedMs) / 1000));
    const progress = Math.min(100, (elapsedMs / maxMs) * 100);
    const canStop = elapsedMs >= MIN_RECORD_DURATION_MS;
    const minRemainingSec = Math.max(
      0,
      Math.ceil((MIN_RECORD_DURATION_MS - elapsedMs) / 1000),
    );

    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {status === "recording" && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
              <Circle className="h-2 w-2 animate-pulse fill-red-500 text-red-500" />
              REC · {remainingSec}s
            </div>
          )}
          {status === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                onClick={requestCamera}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/90"
              >
                <Camera className="h-4 w-4" />
                Enable camera
              </button>
            </div>
          )}
          {status === "requesting" && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-white">
              <p className="text-sm">{error}</p>
              <button
                type="button"
                onClick={requestCamera}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {status === "recording" && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {status === "ready" && (
            <button
              type="button"
              onClick={start}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Circle className="h-3 w-3 fill-current" />
              Start recording
            </button>
          )}
          {status === "recording" && (
            <button
              type="button"
              onClick={stop}
              disabled={!canStop}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square className="h-3 w-3 fill-current" />
              {canStop ? "I'm done" : `I'm done (${minRemainingSec}s)`}
            </button>
          )}
          {status === "stopping" && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          )}
        </div>
      </div>
    );
  },
);
