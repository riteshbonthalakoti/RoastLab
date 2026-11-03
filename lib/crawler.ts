/**
 * Client for the self-hosted crawler service (see /crawler).
 * It drives a real headless browser against the target URL and returns screenshots plus a
 * DESIGN.md (theme, typography, layout, CTAs, a11y, mobile, perf, SEO, verbatim text).
 *
 * Opt-in: returns null when CRAWLER_URL / CRAWLER_TOKEN are unset, the service fails, or the
 * target served a bot-block page — callers then fall back to Firecrawl / the legacy path.
 */

import { put } from '@vercel/blob';

export interface CrawlResult {
  finalUrl: string;
  designMd: string;
  screenshots: { desktopSections: string[]; mobile: string[] };
}

interface CrawlerResponse extends CrawlResult {
  blocked?: boolean;
  error?: string;
}

async function crawl(url: string): Promise<CrawlResult | null> {
  const base = process.env.CRAWLER_URL;
  const token = process.env.CRAWLER_TOKEN;
  if (!base || !token) return null;

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/crawl`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, subpages: true }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      console.warn(`[crawler] service returned ${res.status}`);
      return null;
    }
    const json = (await res.json()) as CrawlerResponse;
    if (json.blocked) {
      console.warn('[crawler] target served a bot-block page, falling back');
      return null;
    }
    if (!json.designMd || json.screenshots?.desktopSections?.length === 0) return null;
    return { finalUrl: json.finalUrl, designMd: json.designMd, screenshots: json.screenshots };
  } catch (e) {
    console.warn('[crawler] request failed:', e);
    return null;
  }
}

// captureScreenshot / captureMultipleScreenshots / crawlPage / extractSiteData / crawlSubpages
// all run in parallel for one audit — share one crawl instead of launching five browsers.
const inflight = new Map<string, Promise<CrawlResult | null>>();

export function getCrawl(url: string): Promise<CrawlResult | null> {
  if (!process.env.CRAWLER_URL || !process.env.CRAWLER_TOKEN) return Promise.resolve(null);
  let p = inflight.get(url);
  if (!p) {
    p = crawl(url);
    inflight.set(url, p);
    setTimeout(() => inflight.delete(url), 120_000).unref?.();
  }
  return p;
}

const uploads = new WeakMap<CrawlResult, Promise<string[]>>();

/** Uploads the desktop sections to Blob once per crawl and returns their public URLs (in order). */
export function uploadCrawlSections(cr: CrawlResult): Promise<string[]> {
  let p = uploads.get(cr);
  if (!p) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      p = Promise.resolve([]);
    } else {
      const ts = Date.now();
      p = Promise.all(
        cr.screenshots.desktopSections.map((b64, i) =>
          put(`screenshots/section-${i}-${ts}.jpg`, Buffer.from(b64, 'base64'), { access: 'public', contentType: 'image/jpeg' })
            .then((b) => b.url)
            .catch(() => null),
        ),
      ).then((urls) => urls.filter((u): u is string => !!u));
    }
    uploads.set(cr, p);
  }
  return p;
}
