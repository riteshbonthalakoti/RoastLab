/**
 * Firecrawl client — one /v2/scrape call returns the full-page screenshot,
 * rendered HTML, markdown (nav/header/footer kept), and design data.
 * Opt-in: everything returns null when FIRECRAWL_API_KEY is unset or the call fails,
 * so callers fall back to the legacy thum.io / Jina path.
 */

const ENDPOINT = 'https://api.firecrawl.dev/v2/scrape';

export interface FirecrawlResult {
  markdown: string;
  rawHtml: string;
  screenshotUrl: string | null;
  branding: unknown;
  computedStyles: string | null;
}

interface ScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    rawHtml?: string;
    screenshot?: string;
    branding?: unknown;
    actions?: { javascriptReturns?: { value?: unknown }[] };
  };
}

// Summarises computed styles of the elements that matter for design/CTA/a11y findings.
const STYLE_PROBE = `JSON.stringify(
  [...document.querySelectorAll('h1,h2,h3,a,button,[role="button"],p')].slice(0, 60).map(function (e) {
    var s = getComputedStyle(e), r = e.getBoundingClientRect();
    return { tag: e.tagName, text: (e.innerText || '').trim().slice(0, 60), font: s.fontFamily.split(',')[0],
      size: s.fontSize, weight: s.fontWeight, color: s.color, bg: s.backgroundColor,
      w: Math.round(r.width), h: Math.round(r.height) };
  })
)`;

async function callFirecrawl(url: string, minimal: boolean): Promise<ScrapeResponse | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;

  const body = {
    url,
    formats: [
      'markdown',
      'rawHtml',
      { type: 'screenshot', fullPage: true, quality: 80, viewport: { width: 1280, height: 800 } },
      ...(minimal ? [] : ['branding']),
    ],
    onlyMainContent: false,
    blockAds: true,
    proxy: 'auto',
    waitFor: 2000,
    timeout: 80_000,
    ...(minimal ? {} : { actions: [{ type: 'executeJavascript', script: STYLE_PROBE }] }),
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    console.warn(`[firecrawl] ${minimal ? 'minimal' : 'full'} scrape failed: ${res.status}`);
    return null;
  }
  return (await res.json()) as ScrapeResponse;
}

async function scrape(url: string): Promise<FirecrawlResult | null> {
  try {
    // Retry once with a leaner request in case optional formats/actions are rejected.
    const json = (await callFirecrawl(url, false)) ?? (await callFirecrawl(url, true));
    if (!json?.success || !json.data) return null;

    const probe = json.data.actions?.javascriptReturns?.[0]?.value;
    return {
      markdown: json.data.markdown ?? '',
      rawHtml: json.data.rawHtml ?? '',
      screenshotUrl: json.data.screenshot ?? null,
      branding: json.data.branding ?? null,
      computedStyles: typeof probe === 'string' ? probe : null,
    };
  } catch (e) {
    console.warn('[firecrawl] scrape error:', e);
    return null;
  }
}

// captureScreenshot / captureMultipleScreenshots / crawlPage / extractSiteData run in
// parallel for one audit — share a single scrape so we spend one request, not four.
const inflight = new Map<string, Promise<FirecrawlResult | null>>();

export function getFirecrawl(url: string): Promise<FirecrawlResult | null> {
  if (!process.env.FIRECRAWL_API_KEY) return Promise.resolve(null);
  let p = inflight.get(url);
  if (!p) {
    p = scrape(url);
    inflight.set(url, p);
    setTimeout(() => inflight.delete(url), 120_000).unref?.();
  }
  return p;
}

export async function downloadScreenshot(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
