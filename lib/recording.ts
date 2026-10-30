export const RECORD_TIMESLICE_MS = 5_000;
export const MIN_RECORD_DURATION_MS = 3_000;
export const DEFAULT_MAX_RECORD_DURATION_MS = 90_000;

export const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 960 },
    height: { ideal: 540 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: "user",
  },
  audio: true,
};

const PREFERRED_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

export function buildRecorderOptions(): MediaRecorderOptions {
  return {
    mimeType: pickMimeType(),
    videoBitsPerSecond: 600_000,
    audioBitsPerSecond: 96_000,
  };
}

export function isWebcamRecordingSupported(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { mediaDevices?: MediaDevices };
  if (!nav.mediaDevices?.getUserMedia) return false;
  return typeof MediaRecorder !== "undefined";
}
