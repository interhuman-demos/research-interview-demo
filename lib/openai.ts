import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  client = new OpenAI({ apiKey });
  return client;
}

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
export const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini";
export const WHISPER_MODEL = process.env.OPENAI_WHISPER_MODEL ?? "whisper-1";
