// Pure so it is testable: gemini.ts reaches config.js via prompts.ts, and CI has
// no config.json. Sized for real bursts — the old 5s/10s gave up ~15s in.

const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 45000;
const JITTER = 0.2;

/** Retries after this many failures, so 5 attempts in total. */
export const GEMINI_MAX_RETRIES = 4;

/** Narrow on purpose: a 404 for a key-retired model is permanent, not transient. */
export function isRetryableGeminiError(message: string): boolean {
  return (
    message.includes("503") ||
    message.includes("429") ||
    message.includes("UNAVAILABLE") ||
    message.includes("RESOURCE_EXHAUSTED")
  );
}

/** Capped exponential backoff; jitter stops the 8x/day crypto cadence retrying in lockstep. */
export function retryDelayMs(attempt: number, rand: () => number = Math.random): number {
  const nominal = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  const factor = 1 - JITTER + 2 * JITTER * rand();
  return Math.round(nominal * factor);
}

/** Worst-case total spent waiting before giving up — jitter excluded. */
export function totalRetryWindowMs(): number {
  let total = 0;
  for (let i = 0; i < GEMINI_MAX_RETRIES; i++) total += retryDelayMs(i, () => 0.5);
  return total;
}
