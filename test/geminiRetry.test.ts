import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  GEMINI_MAX_RETRIES,
  isRetryableGeminiError,
  retryDelayMs,
  totalRetryWindowMs,
} from "../src/providers/geminiRetry.js";

describe("isRetryableGeminiError", () => {
  test("retries the transient capacity and quota failures", () => {
    assert.equal(isRetryableGeminiError("got 503 from upstream"), true);
    assert.equal(isRetryableGeminiError("429 Too Many Requests"), true);
    assert.equal(isRetryableGeminiError("status: UNAVAILABLE"), true);
    assert.equal(isRetryableGeminiError("RESOURCE_EXHAUSTED"), true);
  });

  test("does not retry a model that is gone for this key", () => {
    // The 404 a new key gets for a retired model is permanent — retrying it
    // just burns the whole window before failing anyway.
    assert.equal(
      isRetryableGeminiError("404 models/gemini-2.5-flash is no longer available to new users"),
      false,
    );
  });

  test("does not retry auth or malformed-request failures", () => {
    assert.equal(isRetryableGeminiError("400 INVALID_ARGUMENT"), false);
    assert.equal(isRetryableGeminiError("403 PERMISSION_DENIED"), false);
    assert.equal(isRetryableGeminiError(""), false);
  });
});

describe("retryDelayMs — exponential backoff with jitter", () => {
  const mid = () => 0.5; // midpoint jitter → the nominal delay

  test("doubles each attempt from a 5s base", () => {
    assert.equal(retryDelayMs(0, mid), 5000);
    assert.equal(retryDelayMs(1, mid), 10000);
    assert.equal(retryDelayMs(2, mid), 20000);
    assert.equal(retryDelayMs(3, mid), 40000);
  });

  test("caps so one spike cannot stall a run indefinitely", () => {
    assert.equal(retryDelayMs(9, mid), 45000);
  });

  test("jitter stays within ±20% and never goes negative", () => {
    for (const r of [0, 0.25, 0.75, 1]) {
      const d = retryDelayMs(1, () => r);
      assert.ok(d >= 8000 && d <= 12000, `expected 8000..12000, got ${d}`);
    }
  });

  test("returns whole milliseconds (setTimeout takes integers)", () => {
    assert.equal(Number.isInteger(retryDelayMs(2, () => 0.37)), true);
  });
});

describe("retry window", () => {
  test("rides out a spike lasting over a minute", () => {
    // The old policy was 2 retries at 5s/10s — it gave up after ~15s, which is
    // what turned brief 503 bursts into a lost provider for the whole run.
    assert.ok(
      totalRetryWindowMs() > 60000,
      `window ${totalRetryWindowMs()}ms should exceed the old 15s by a wide margin`,
    );
  });

  test("stays well inside the Actions job limit", () => {
    assert.ok(totalRetryWindowMs() < 180000);
  });

  test("exposes the retry count the wrapper actually uses", () => {
    assert.equal(GEMINI_MAX_RETRIES, 4);
  });
});
