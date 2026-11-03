import { put } from '@vercel/blob';
import sharp from 'sharp';
import { getFirecrawl, downloadScreenshot } from './firecrawl';

async function getFirecrawlShot(url: string): Promise<{ buffer: Buffer; screenshotUrl: string } | null> {
  const fc = await getFirecrawl(url);
  if (!fc?.screenshotUrl) return null;
  const buffer = await downloadScreenshot(fc.screenshotUrl);
  if (!buffer || await isBotBlockPage(buffer)) return null;
  return { buffer, screenshotUrl: fc.screenshotUrl };
}

// Detect bot-block/403 pages: resize to 10x10, check if all pixels are nearly identical (uniform error page)
async function isBotBlockPage(buf: Buffer): Promise<boolean> {
  try {
    const { data } = await sharp(buf).resize(10, 10, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const pixels = Array.from(data);
    const avg = pixels.reduce((s, v) => s + v, 0) / pixels.length;
    // If >90% of pixels within 15 of average → near-uniform → likely error page
    const uniform = pixels.filter(v => Math.abs(v - avg) < 15).length / pixels.length;
    // Also flag near-white pages (bot check / 403 HTML with white bg)
    const nearWhite = avg > 230;
    return uniform > 0.9 || nearWhite;
  } catch {
    return false;
  }
}

export async function captureScreenshot(url: string): Promise<{
  base64: string;
  mimeType: 'image/jpeg';
  screenshotUrl: string;
}> {
  // Firecrawl (when configured): crop the hero (top 900px) out of its full-page capture.
  const fcShot = await getFirecrawlShot(url);
  if (fcShot) {
    try {
      const meta = await sharp(fcShot.buffer).metadata();
      const hero = await sharp(fcShot.buffer)
        .extract({ left: 0, top: 0, width: meta.width ?? 1280, height: Math.min(900, meta.height ?? 900) })
        .jpeg({ quality: 85 })
        .toBuffer();
      return { base64: hero.toString('base64'), mimeType: 'image/jpeg', screenshotUrl: fcShot.screenshotUrl };
    } catch {
      // fall through to legacy capture
    }
  }

  // Primary: thum.io — no API key, free, reliable. 5s wait before capture.
  try {
    const thumUrl = `https://image.thum.io/get/width/1280/crop/900/noanimate/viewportwait/15000/${url}`;
    const res = await fetch(thumUrl, {
      headers: { 'User-Agent': 'RoastLab/1.0 (+https://getroastlab.vercel.app)' },
      signal: AbortSignal.timeout(40_000),
    });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > 30_000) {
        const candidate = Buffer.from(buffer);
        if (!await isBotBlockPage(candidate)) {
          const base64 = candidate.toString('base64');
          return { base64, mimeType: 'image/jpeg', screenshotUrl: thumUrl };
        }
      }
    }
  } catch {
    // fall through to microlink
  }

  // Fallback: microlink
  const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&screenshot.type=jpeg&screenshot.quality=80&screenshot.waitForTimeout=5000`;
  const res = await fetch(apiUrl, {
    headers: process.env.MICROLINK_API_KEY ? { 'x-api-key': process.env.MICROLINK_API_KEY } : {},
    signal: AbortSignal.timeout(35_000),
  });

  if (!res.ok) throw new Error(`screenshot failed: ${res.status} ${res.statusText}`);

  const json = await res.json() as { status: string; data?: { screenshot?: { url?: string } } };
  if (json.status !== 'success') throw new Error(`microlink: ${json.status}`);

  const screenshotUrl = json?.data?.screenshot?.url;
  if (!screenshotUrl) throw new Error('no screenshot URL returned — site may block headless browsers');

  const imgRes = await fetch(screenshotUrl);
  if (!imgRes.ok) throw new Error(`screenshot download failed: ${imgRes.status}`);

  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { base64, mimeType: 'image/jpeg', screenshotUrl };
}

/**
 * Option B: Fetch ONE thum.io fullpage screenshot, then crop it into overlapping
 * sections using Sharp so the entire site is analyzed — not just 3 hardcoded crops.
 * Falls back to microlink if thum.io returns nothing.
 *
 * Returns array of public Blob URLs (one per section) or thum.io crop URLs as fallback.
 * Section height = 900px, overlap = 150px, so no content falls through the cracks.
 */
export async function captureMultipleScreenshots(url: string): Promise<string[]> {
  // Wait 15s so Cloudflare/bot-check pages finish loading before capture.
  // viewportwait=15000 tells thum.io to idle 15s after DOMContentLoaded.
  const thumFullUrl = `https://image.thum.io/get/width/1280/noanimate/viewportwait/15000/fullpage/${url}`;

  // Fetch BOTH thum.io and microlink fullpage, then keep whichever is TALLER —
  // both services intermittently return just the viewport instead of the true
  // full page, so racing them and picking the taller image maximizes coverage.
  const MIN_BYTES = 8_000; // low enough to accept small-but-valid pages, high enough to reject blanks

  async function tryThum(): Promise<Buffer | null> {
    try {
      const res = await fetch(thumFullUrl, {
        headers: { 'User-Agent': 'RoastLab/1.0 (+https://getroastlab.vercel.app)' },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < MIN_BYTES) return null;
      if (await isBotBlockPage(buf)) return null;
      return buf;
    } catch { return null; }
  }

  async function tryMicrolink(): Promise<Buffer | null> {
    try {
      const mlUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&screenshot.type=png&screenshot.fullPage=true&screenshot.waitForTimeout=12000`;
      const res = await fetch(mlUrl, {
        headers: process.env.MICROLINK_API_KEY ? { 'x-api-key': process.env.MICROLINK_API_KEY } : {},
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return null;
      const json = await res.json() as { status: string; data?: { screenshot?: { url?: string } } };
      if (json.status !== 'success' || !json.data?.screenshot?.url) return null;
      const imgRes = await fetch(json.data.screenshot.url, { signal: AbortSignal.timeout(20_000) });
      if (!imgRes.ok) return null;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.byteLength < MIN_BYTES) return null;
      if (await isBotBlockPage(buf)) return null;
      return buf;
    } catch { return null; }
  }

  // Firecrawl first (handles bot protection + JS rendering); legacy race only if it yields nothing.
  const fcShot = await getFirecrawlShot(url);
  let imageBuffer: Buffer | null = fcShot?.buffer ?? null;

  if (!imageBuffer) {
    const [thumBuf, mlBuf] = await Promise.all([tryThum(), tryMicrolink()]);

    // Pick the taller image (more of the page captured)
    try {
      const th = thumBuf ? (await sharp(thumBuf).metadata()).height ?? 0 : 0;
      const mh = mlBuf ? (await sharp(mlBuf).metadata()).height ?? 0 : 0;
      imageBuffer = th >= mh ? (thumBuf ?? mlBuf) : (mlBuf ?? thumBuf);
    } catch {
      imageBuffer = thumBuf ?? mlBuf;
    }
  }

  // Crop fullpage into non-overlapping 900px sections via Sharp, upload to Blob
  if (imageBuffer && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const meta = await sharp(imageBuffer).metadata();
      const W = meta.width ?? 1280;
      const H = meta.height ?? 900;
      const SECTION_H = 900;

      // Build distinct Y positions — no overlap (prevents duplicate-looking frames)
      const yPositions: number[] = [];
      let y = 0;
      while (y < H) {
        yPositions.push(y);
        y += SECTION_H;
      }

      // Cover the ENTIRE page navbar→footer. Cap at 20 sections (18000px) as a
      // sanity limit against pathologically long / infinite-scroll pages.
      const toCapture = yPositions.slice(0, 20);

      const sections: Buffer[] = [];
      for (const top of toCapture) {
        const h = Math.min(SECTION_H, H - top);
        if (h < 150) continue; // skip tiny slivers
        const section = await sharp(imageBuffer)
          .extract({ left: 0, top, width: W, height: h })
          .jpeg({ quality: 85 })
          .toBuffer();
        sections.push(section);
      }

      if (sections.length > 0) {
        const ts = Date.now();
        const uploaded = await Promise.all(
          sections.map((s, i) =>
            put(`screenshots/section-${i}-${ts}.jpg`, s, { access: 'public', contentType: 'image/jpeg' })
              .then(b => b.url)
              .catch(() => null)
          )
        );
        const urls = uploaded.filter(Boolean) as string[];
        if (urls.length > 0) return urls;
      }
    } catch (e) {
      console.warn('[screenshot] sharp crop failed:', e);
    }
  }

  // No Blob token — return fullpage URL directly
  if (imageBuffer) return [fcShot?.screenshotUrl ?? thumFullUrl];

  // Last resort — two thum.io viewport crops (different crop heights = different sections)
  const thumBase = 'https://image.thum.io/get/width/1280/noanimate/viewportwait/15000';
  const results = await Promise.all([
    fetch(`${thumBase}/crop/900/${url}`, { signal: AbortSignal.timeout(30_000) })
      .then(r => r.ok ? `${thumBase}/crop/900/${url}` : null).catch(() => null),
    fetch(`${thumBase}/crop/1800/${url}`, { signal: AbortSignal.timeout(30_000) })
      .then(r => r.ok ? `${thumBase}/crop/1800/${url}` : null).catch(() => null),
  ]);
  return results.filter(Boolean) as string[];
}

/**
 * Crawl a URL with Jina AI Reader — returns clean markdown of the full page.
 * Free, no API key, JS-rendered, strips nav/footer noise, fails gracefully.
 */
export async function crawlPage(url: string): Promise<string> {
  // Firecrawl markdown keeps nav/header/footer (CTAs, trust badges) that Jina's selector strips.
  const fc = await getFirecrawl(url);
  if (fc && fc.markdown.length > 200) return fc.markdown.slice(0, 10_000);

  const headers = {
    'Accept': 'text/markdown',
    'X-Return-Format': 'markdown',
    'X-Timeout': '18',
    'X-Remove-Selector': 'header,nav,footer,#cookie-banner,[class*="cookie"],[id*="cookie"],[class*="nav-"],[id*="nav"],[class*="header"],[class*="footer"],[class*="sidebar"],[class*="menu"]',
    'X-With-Generated-Alt': 'true',
    'User-Agent': 'RoastLab/1.0 (+https://getroastlab.vercel.app)',
  };

  const attempt = async (): Promise<string> => {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(22_000),
    });
    if (!res.ok) return '';
    const raw = await res.text();
    // Remove Jina metadata header lines before actual content
    const lines = raw.split('\n');
    const contentStart = lines.findIndex(l => l.startsWith('#') || (l.trim().length > 80));
    const content = contentStart > 0 ? lines.slice(contentStart).join('\n') : raw;
    return content.slice(0, 8000);
  };

  try {
    return await attempt();
  } catch {
    // 1 retry after brief delay
    try {
      await new Promise(r => setTimeout(r, 1500));
      return await attempt();
    } catch {
      return '';
    }
  }
}

/**
 * Fetch raw HTML and extract color palette, fonts, meta tags.
 * Free — direct HTTP fetch, no API key needed.
 */
export async function extractSiteData(url: string): Promise<string> {
  try {
    const fc = await getFirecrawl(url);
    let html = fc?.rawHtml ?? '';
    if (!html) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(14_000),
      });
      if (!res.ok) return '';
      html = await res.text();
    }

    // Colors
    const hexColors = [...new Set([...html.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map(m => m[0]))].slice(0, 15);
    const rgbColors = [...new Set([...html.matchAll(/rgba?\(\s*\d+,\s*\d+,\s*\d+[^)]*\)/g)].map(m => m[0]))].slice(0, 8);

    // Fonts
    const fonts = [...new Set([...html.matchAll(/font-family:\s*([^;}"']+)/gi)].map(m => m[1].trim().split(',')[0].replace(/["']/g, '')))].slice(0, 6);
    const googleFonts = [...html.matchAll(/family=([A-Za-z+]+)/g)].map(m => m[1].replace(/\+/g, ' '));

    // Meta / headings
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,200})/i)?.[1]?.trim() ?? '';
    const metaOgTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{0,100})/i)?.[1]?.trim() ?? '';
    const h1Tags = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).slice(0, 3);
    const h2Tags = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 6);

    // Images (check for missing alt)
    const imgTags = [...html.matchAll(/<img[^>]+>/gi)].slice(0, 20);
    const imgNoAlt = imgTags.filter(m => !m[0].includes('alt=')).length;
    const imgEmptyAlt = imgTags.filter(m => /alt=["']\s*["']/.test(m[0])).length;

    // Links / nav
    const navLinks = [...html.matchAll(/href=["']([^"'#?][^"']*?)["']/gi)].map(m => m[1]).filter(l => l.startsWith('/') && l.length < 40).slice(0, 10);

    // CSS custom properties (design tokens)
    const cssVars = [...html.matchAll(/--[\w-]+:\s*([^;}"]+)/g)].map(m => `${m[0].split(':')[0]}: ${m[1].trim()}`).slice(0, 12);

    const lines: string[] = ['## Extracted Site Technical Data (use for accurate findings)'];
    if (title) lines.push(`Page Title: "${title}"`);
    if (metaOgTitle && metaOgTitle !== title) lines.push(`OG Title: "${metaOgTitle}"`);
    if (metaDesc) lines.push(`Meta Description: "${metaDesc}"`);
    if (h1Tags.length) lines.push(`H1 tags: ${h1Tags.map(h => `"${h}"`).join(' | ')}`);
    if (h2Tags.length) lines.push(`H2 tags: ${h2Tags.map(h => `"${h}"`).join(' | ')}`);
    if (hexColors.length) lines.push(`Color palette (hex): ${hexColors.join(', ')}`);
    if (rgbColors.length) lines.push(`Colors (rgb): ${rgbColors.join(', ')}`);
    if (fonts.length) lines.push(`CSS font-family: ${fonts.join(', ')}`);
    if (googleFonts.length) lines.push(`Google Fonts loaded: ${[...new Set(googleFonts)].join(', ')}`);
    if (cssVars.length) lines.push(`CSS variables: ${cssVars.join('; ')}`);
    if (imgNoAlt > 0) lines.push(`Images missing alt text: ${imgNoAlt}`);
    if (imgEmptyAlt > 0) lines.push(`Images with empty alt="": ${imgEmptyAlt}`);
    if (navLinks.length) lines.push(`Internal paths found: ${navLinks.join(', ')}`);
    if (fc?.branding) lines.push(`Detected branding (rendered page): ${JSON.stringify(fc.branding).slice(0, 1500)}`);
    if (fc?.computedStyles) lines.push(`Computed styles of key elements (rendered, JSON): ${fc.computedStyles.slice(0, 3000)}`);

    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * Try to crawl 2 subpages (about, pricing, etc.) to get broader site context.
 * Only for premium audits.
 */
export async function crawlSubpages(url: string): Promise<string> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return '';
  }

  const candidates = ['/about', '/about-us', '/pricing', '/features', '/product', '/services', '/contact'];
  const toTry = candidates.slice(0, 4);

  const results = await Promise.allSettled(
    toTry.map(async (path) => {
      const res = await fetch(`https://r.jina.ai/${origin}${path}`, {
        headers: { 'Accept': 'text/markdown', 'X-Timeout': '10' },
        signal: AbortSignal.timeout(14_000),
      });
      if (!res.ok) return null;
      const text = await res.text();
      if (text.length < 200 || text.includes('404') || text.includes('Page not found')) return null;
      return `### ${path}\n${text.slice(0, 2000)}`;
    })
  );

  const valid = results
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled' && !!r.value)
    .map(r => r.value as string);

  return valid.length > 0 ? `## Additional Pages Crawled\n${valid.join('\n\n')}` : '';
}

export async function uploadScreenshot(
  base64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<string> {
  // If Blob token not configured, skip upload silently
  if (!process.env.BLOB_READ_WRITE_TOKEN) return '';

  const ext = mimeType.split('/')[1];
  const filename = `screenshots/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(base64, 'base64');

  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  return blob.url;
}
