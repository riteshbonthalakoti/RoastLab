/**
 * AI provider fallback chain.
 * All providers expose OpenAI-compatible API — single client, different baseURL + model.
 * On 429 (rate limit) or 5xx, automatically tries next provider.
 */

import OpenAI from 'openai';

export type Provider = {
  name: string;
  client: OpenAI;
  model: string;
  supportsVision: boolean;
  /** Ask for response_format json_object (only set where the provider documents support). */
  jsonMode?: boolean;
};

/** Thrown when a model answers but not with usable audit JSON. */
export class UnusableOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableOutputError';
  }
}

// maxRetries 0: the SDK's default of 2 retries hammers a rate-limited free tier and slows every
// failure; withFallback already moves on to the next provider. The timeout keeps one hung
// provider from eating the whole function budget.
function makeClient(baseURL: string, apiKey: string, extraHeaders?: Record<string, string>): OpenAI {
  return new OpenAI({
    baseURL,
    apiKey,
    dangerouslyAllowBrowser: false,
    defaultHeaders: extraHeaders,
    maxRetries: 0,
    timeout: 30_000,
  });
}

const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://getroastlab.vercel.app',
  'X-Title': 'RoastLab',
};

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
  jsonMode?: boolean;
}

/**
 * Ordered fallback chain.
 * Index 0 = primary; last index = last resort.
 * Add/remove entries here as keys change.
 *
 * Model IDs last checked 2026-11-03 against the providers' own errors and docs:
 * - Groq retired meta-llama/llama-4-scout-17b-16e-instruct on 2026-07-17 (every call returned 404).
 *   Its vision model is now qwen/qwen3.8-27b (preview, JSON mode supported, 3 images per request).
 * - OpenRouter free models: only list ones that actually answer chat completions. Being
 *   image-capable in /models is not enough (thinkingmachines/inkling:free returns 403
 *   "only available on agentic harnesses").
 */
export function getProviders(): Provider[] {
  const configs: ProviderConfig[] = [
    { name: 'groq-1', baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_KEY_1 ?? '', model: 'qwen/qwen3.8-27b', jsonMode: true },
    { name: 'groq-2', baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_KEY_2 ?? '', model: 'qwen/qwen3.8-27b', jsonMode: true },
    { name: 'openrouter-gemma', baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_KEY_1 ?? '', model: 'google/gemma-4-26b-a4b-it:free', headers: OPENROUTER_HEADERS },
    { name: 'openrouter-nemotron', baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_KEY_2 ?? '', model: 'nvidia/nemotron-3.5-super-vl:free', headers: OPENROUTER_HEADERS },
    { name: 'openrouter-gemma-31b', baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_KEY_1 ?? '', model: 'google/gemma-4-31b-it:free', headers: OPENROUTER_HEADERS },
  ];

  // Filter on the key BEFORE building clients: the SDK throws synchronously on an empty apiKey.
  return configs
    .filter((c) => c.apiKey.length > 10)
    .map((c) => ({
      name: c.name,
      client: makeClient(c.baseURL, c.apiKey, c.headers),
      model: c.model,
      supportsVision: true,
      jsonMode: c.jsonMode,
    }));
}

/** True when worth trying next provider (rate limit, quota, server error, model not found, network). */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    // 400 = OpenRouter's "not a valid model ID" for a stale/retired free model
    //       (OpenRouter returns 400 here, not 404, so this must stay retryable
    //       or one bad model ID in the chain kills every audit outright)
    // 403 = quota exhausted on free tier (OpenRouter free models)
    // 404 = model not found on this provider
    // 429 = rate limit
    // 5xx = server error
    return err.status === 400 || err.status === 403 || err.status === 404 || err.status === 429 || err.status >= 500;
  }
  // Network errors, timeouts, DNS failures, unusable model output — always retry next provider
  return true;
}

/* ─── provider health ───────────────────────────────────────────────────────
   A provider that failed in a way that will not fix itself within seconds (retired model, no
   access, bad request, quota, rate limit, a model that never returns JSON) is skipped for a
   while, so the remaining dimensions of an audit do not pay for it again. In-memory: lasts as
   long as the warm function instance, which is what an audit needs. */

const unavailableUntil = new Map<string, number>();

/** How long to skip a provider after this failure; 0 = keep trying it. */
export function cooldownMs(err: unknown): number {
  if (err instanceof UnusableOutputError) return 60_000;
  if (!(err instanceof OpenAI.APIError)) return 0;
  const status = err.status;
  if (status === 404 || status === 401 || status === 403) return 30 * 60_000;
  if (status === 400) return 10 * 60_000;
  if (status === 429) {
    const retryAfter = Number((err.headers as Record<string, string> | undefined)?.['retry-after']);
    return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 120_000) : 30_000;
  }
  return 0;
}

export function markUnavailable(name: string, ms: number, now = Date.now()): void {
  if (ms > 0) unavailableUntil.set(name, now + ms);
}

export function isAvailable(name: string, now = Date.now()): boolean {
  return (unavailableUntil.get(name) ?? 0) <= now;
}

export function resetProviderHealth(): void {
  unavailableUntil.clear();
}

/** Status + short message for logs, with anything that looks like an API key redacted. */
function describeError(err: unknown): string {
  const status = err instanceof OpenAI.APIError ? err.status : undefined;
  const msg = (err instanceof Error ? err.message : String(err))
    .replace(/\b(?:gsk_|sk-|sk_|fc-)[\w-]{6,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
  return `${status ?? 'no-status'} ${msg}`;
}

/**
 * Run fn with automatic fallback across providers.
 * Tries each available provider in order; stops on first success.
 * Re-throws the last error if all providers fail.
 */
export async function withFallback<T>(
  fn: (provider: Provider) => Promise<T>
): Promise<{ result: T; providerUsed: string }> {
  const all = getProviders();
  // If every provider is cooling down, try them all anyway rather than failing without a call.
  const healthy = all.filter((p) => isAvailable(p.name));
  const providers = healthy.length > 0 ? healthy : all;
  let lastErr: unknown;

  for (const provider of providers) {
    try {
      const result = await fn(provider);
      return { result, providerUsed: provider.name };
    } catch (err) {
      lastErr = err;
      if (isRetryableError(err)) {
        const cool = cooldownMs(err);
        markUnavailable(provider.name, cool);
        console.warn(`[ai] ${provider.name} (${provider.model}) failed: ${describeError(err)} — trying next${cool ? ` (skipping it for ${Math.round(cool / 1000)}s)` : ''}`);
        continue;
      }
      // Non-retryable (auth error, bad request) — fail fast
      throw err;
    }
  }

  throw lastErr;
}
