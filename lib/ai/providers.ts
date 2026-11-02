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
};

function makeClient(baseURL: string, apiKey: string, extraHeaders?: Record<string, string>): OpenAI {
  return new OpenAI({
    baseURL,
    apiKey,
    dangerouslyAllowBrowser: false,
    defaultHeaders: extraHeaders,
  });
}

const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://getroastlab.vercel.app',
  'X-Title': 'RoastLab',
};

/**
 * Ordered fallback chain.
 * Index 0 = primary; last index = last resort.
 * Add/remove entries here as keys change.
 */
export function getProviders(): Provider[] {
  return [
    // Groq — only working reliable free vision model. Both keys use the same
    // model (llama-4-scout is Groq's ONLY vision model) to double free quota.
    {
      name: 'groq-1',
      client: makeClient('https://api.groq.com/openai/v1', process.env.GROQ_KEY_1 ?? ''),
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      supportsVision: true,
    },
    {
      name: 'groq-2',
      client: makeClient('https://api.groq.com/openai/v1', process.env.GROQ_KEY_2 ?? ''),
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      supportsVision: true,
    },
    // OpenRouter free vision models — verified free + image-capable (Nov 2026).
    // llama-4-*:free went paid; these are the current actually-free vision models.
    {
      name: 'openrouter-gemma',
      client: makeClient('https://openrouter.ai/api/v1', process.env.OPENROUTER_KEY_1 ?? '', OPENROUTER_HEADERS),
      model: 'google/gemma-4-26b-a4b-it:free',
      supportsVision: true,
    },
    {
      name: 'openrouter-nemotron',
      client: makeClient('https://openrouter.ai/api/v1', process.env.OPENROUTER_KEY_2 ?? '', OPENROUTER_HEADERS),
      model: 'nvidia/nemotron-nano-12b-v2-vl:free',
      supportsVision: true,
    },
    // Vision-capable free fallbacks — verified free + image-capable
    {
      name: 'openrouter-qwen',
      client: makeClient('https://openrouter.ai/api/v1', process.env.OPENROUTER_KEY_1 ?? '', OPENROUTER_HEADERS),
      model: 'qwen/qwen2.5-vl-7b-instruct:free',
      supportsVision: true,
    },
    {
      name: 'openrouter-llama-vision',
      client: makeClient('https://openrouter.ai/api/v1', process.env.OPENROUTER_KEY_2 ?? '', OPENROUTER_HEADERS),
      model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
      supportsVision: true,
    },
  ].filter((p) => {
    // Skip providers with missing keys at runtime
    const key = p.client.apiKey;
    return key && key.length > 10;
  });
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
  // Network errors, timeouts, DNS failures — always retry next provider
  return true;
}

/**
 * Run fn with automatic fallback across providers.
 * Tries each provider in order; stops on first success.
 * Re-throws the last error if all providers fail.
 */
export async function withFallback<T>(
  fn: (provider: Provider) => Promise<T>
): Promise<{ result: T; providerUsed: string }> {
  const providers = getProviders();
  let lastErr: unknown;

  for (const provider of providers) {
    try {
      const result = await fn(provider);
      return { result, providerUsed: provider.name };
    } catch (err) {
      lastErr = err;
      if (isRetryableError(err)) {
        console.warn(`[ai] ${provider.name} rate-limited or error, trying next...`);
        continue;
      }
      // Non-retryable (auth error, bad request) — fail fast
      throw err;
    }
  }

  throw lastErr;
}
