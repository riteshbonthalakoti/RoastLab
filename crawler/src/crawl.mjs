import { devices } from 'playwright';
import { assertPublicUrl, assertPublicHost } from './ssrf.mjs';
import { extractDesktop, extractMobile } from './extract.mjs';
import { buildDesignMd } from './design-md.mjs';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SECTION_H = 900;
const MAX_SECTIONS = 18;
const BLOCK_TITLE = /just a moment|attention required|access denied|verify you are human|are you a robot|captcha|pardon our interruption|request blocked/i;

const PERF_INIT = () => {
  window.__rl = { lcp: 0, cls: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__rl.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // unsupported
  }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__rl.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    // unsupported
  }
};

const rootDomain = (h) => h.split('.').slice(-2).join('.');

async function guardRequests(context) {
  await context.route('**/*', async (route) => {
    try {
      await assertPublicHost(new URL(route.request().url()).hostname.replace(/^\[|\]$/g, ''));
      await route.continue();
    } catch {
      await route.abort('blockedbyclient');
    }
  });
}

async function dismissBanners(page) {
  try {
    await page.evaluate(() => {
      const re = /^(accept( all)?( cookies)?|allow all( cookies)?|i agree|agree|got it|ok|okay|accept (&|and) close|reject all|decline)$/i;
      const sel = '#onetrust-accept-btn-handler,#truste-consent-button,button[id*="accept" i],button[class*="accept" i],[aria-label*="accept" i]';
      const el = document.querySelector(sel) || [...document.querySelectorAll('button,a[role="button"]')].find((b) => re.test((b.innerText || '').trim()));
      if (el) el.click();
    });
    await page.waitForTimeout(400);
  } catch {
    // best effort
  }
}

async function settle(page) {
  await page.waitForLoadState('load', { timeout: 12000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await dismissBanners(page);
  // Scroll through the page so lazy images and scroll-reveal animations render.
  const height = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
  const steps = Math.min(Math.ceil(height / 700), 28);
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 700).catch(() => {});
    await page.waitForTimeout(110);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  // Scroll-reveal animations replay when returning to the top; give them time to finish.
  await page.waitForTimeout(1600);
}

async function trackNetwork(context, page) {
  const net = { requests: 0, failed: 0, third: 0, bytes: { script: 0, stylesheet: 0, image: 0, font: 0, document: 0, other: 0 } };
  let mainHost = '';
  page.on('request', (r) => {
    net.requests++;
    try {
      const h = new URL(r.url()).hostname;
      if (!mainHost) mainHost = h;
      else if (rootDomain(h) !== rootDomain(mainHost)) net.third++;
    } catch {
      // ignore
    }
  });
  page.on('requestfailed', (r) => {
    if (!/blockedbyclient/i.test(r.failure()?.errorText || '')) net.failed++;
  });
  // Transfer sizes: content-length is absent on most HTTP/2 + compressed responses, CDP reports real bytes.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const types = new Map();
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, String(e.type || 'Other').toLowerCase()));
  cdp.on('Network.loadingFinished', (e) => {
    const t = types.get(e.requestId) || 'other';
    net.bytes[t in net.bytes ? t : 'other'] += e.encodedDataLength || 0;
  });
  return net;
}

async function captureSections(page, height) {
  const total = Math.min(height, SECTION_H * MAX_SECTIONS);
  const out = [];
  for (let y = 0; y < total; y += SECTION_H) {
    const h = Math.min(SECTION_H, total - y);
    if (h < 150) continue;
    const buf = await page.screenshot({ type: 'jpeg', quality: 78, fullPage: true, clip: { x: 0, y, width: 1280, height: h }, timeout: 15000 }).catch(() => null);
    if (buf) out.push(buf.toString('base64'));
  }
  return out;
}

async function crawlSubpages(context, base, navLinks) {
  const wanted = [/pricing|plans/i, /about|company|story/i, /features|product|solutions/i];
  const picked = [];
  for (const re of wanted) {
    const link = navLinks.find((l) => re.test(l.text) || re.test(l.href));
    if (!link) continue;
    try {
      const u = new URL(link.href, base);
      if (u.hostname === new URL(base).hostname && !picked.some((p) => p.pathname === u.pathname) && u.pathname !== '/') picked.push(u);
    } catch {
      // ignore bad href
    }
    if (picked.length >= 2) break;
  }
  const results = [];
  for (const u of picked) {
    const page = await context.newPage();
    try {
      await assertPublicUrl(u.href);
      await page.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('load', { timeout: 6000 }).catch(() => {});
      const data = await page.evaluate(() => {
        const vis = (e) => e.getBoundingClientRect().width > 0;
        return {
          title: document.title,
          headings: [...document.querySelectorAll('h1,h2')].filter(vis).map((h) => (h.innerText || '').trim()).filter(Boolean).slice(0, 8),
          text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1800),
        };
      });
      results.push({ path: u.pathname, ...data });
    } catch {
      // skip this subpage
    } finally {
      await page.close().catch(() => {});
    }
  }
  return results;
}

export async function crawlSite(browser, rawUrl, { subpages = false } = {}) {
  const t0 = Date.now();
  const target = await assertPublicUrl(rawUrl);

  // ---------------- desktop pass ----------------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: DESKTOP_UA, locale: 'en-US', ignoreHTTPSErrors: true });
  let result;
  try {
    await guardRequests(desktop);
    await desktop.addInitScript(PERF_INIT);
    const page = await desktop.newPage();
    const net = await trackNetwork(desktop, page);
    const resp = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settle(page);

    const finalUrl = page.url();
    const status = resp ? resp.status() : null;
    const title = await page.title().catch(() => '');
    const facts = await page.evaluate(extractDesktop);
    const blocked = BLOCK_TITLE.test(title) || status === 403 || status === 429 || (facts.seo.wordCount < 25 && facts.images.total < 2);

    const timing = await page
      .evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return { ttfb: n ? Math.round(n.responseStart) : null, dcl: n ? Math.round(n.domContentLoadedEventEnd) : null, load: n ? Math.round(n.loadEventEnd) : null, lcp: Math.round(window.__rl?.lcp || 0), cls: Math.round((window.__rl?.cls || 0) * 1000) / 1000 };
      })
      .catch(() => null);
    const kb = (k) => Math.round(net.bytes[k] / 1024);
    const perf = timing && {
      ttfb: timing.ttfb,
      domContentLoaded: timing.dcl,
      load: timing.load,
      lcp: timing.lcp || null,
      cls: timing.cls,
      requests: net.requests,
      thirdPartyRequests: net.third,
      failed: net.failed,
      kb: { script: kb('script'), stylesheet: kb('stylesheet'), image: kb('image'), font: kb('font'), total: Math.round(Object.values(net.bytes).reduce((a, b) => a + b, 0) / 1024) },
    };

    const sections = await captureSections(page, facts.pageHeight);
    const subs = subpages && !blocked ? await crawlSubpages(desktop, finalUrl, facts.navLinks) : [];
    result = { finalUrl, status, blocked, facts, perf, sections, subpages: subs };
  } finally {
    await desktop.close().catch(() => {});
  }

  // ---------------- mobile pass ----------------
  let mobile = null;
  let mobileShots = [];
  const phone = devices['iPhone 13'];
  const mctx = await browser.newContext({ ...phone, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  try {
    await guardRequests(mctx);
    const mpage = await mctx.newPage();
    await mpage.goto(result.finalUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await settle(mpage);
    mobile = await mpage.evaluate(extractMobile);
    for (const y of [0, 844]) {
      const buf = await mpage.screenshot({ type: 'jpeg', quality: 78, fullPage: true, clip: { x: 0, y, width: 390, height: 844 }, timeout: 15000 }).catch(() => null);
      if (buf) mobileShots.push(buf.toString('base64'));
    }
  } catch {
    // mobile is best-effort; desktop data is still returned
  } finally {
    await mctx.close().catch(() => {});
  }

  const designMd = buildDesignMd({ url: rawUrl, finalUrl: result.finalUrl, status: result.status, facts: result.facts, mobile, perf: result.perf, subpages: result.subpages });
  return {
    url: rawUrl,
    finalUrl: result.finalUrl,
    status: result.status,
    blocked: result.blocked,
    designMd,
    text: result.facts.text,
    facts: result.facts,
    mobile,
    perf: result.perf,
    subpages: result.subpages,
    screenshots: { desktopSections: result.sections, mobile: mobileShots },
    tookMs: Date.now() - t0,
  };
}
