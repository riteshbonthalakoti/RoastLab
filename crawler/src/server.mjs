import http from 'node:http';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { crawlSite } from './crawl.mjs';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.CRAWLER_TOKEN;
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 2);
const CRAWL_TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS || 80_000);
const QUEUE_WAIT_MS = 20_000;

if (!TOKEN || TOKEN.length < 16) {
  console.error('CRAWLER_TOKEN is required (min 16 chars). Refusing to start an unauthenticated crawler.');
  process.exit(1);
}

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] })
      .then((b) => {
        b.on('disconnected', () => {
          browserPromise = null;
        });
        return b;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

let active = 0;
const waiters = [];
function acquire() {
  if (active < MAX_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const w = { resolve, timer: setTimeout(() => {
      waiters.splice(waiters.indexOf(w), 1);
      reject(new Error('busy'));
    }, QUEUE_WAIT_MS) };
    waiters.push(w);
  });
}
function release() {
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  } else {
    active--;
  }
}

const authorized = (req) => {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
};

function send(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function readJson(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, active });
  if (req.method !== 'POST' || req.url !== '/crawl') return send(res, 404, { error: 'not found' });
  if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
  if (typeof body.url !== 'string' || body.url.length > 2000) return send(res, 400, { error: 'url is required' });

  try {
    await acquire();
  } catch {
    return send(res, 503, { error: 'crawler is busy, retry shortly' });
  }

  let timer;
  try {
    const browser = await getBrowser();
    const result = await Promise.race([
      crawlSite(browser, body.url, { subpages: body.subpages === true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('crawl timed out')), CRAWL_TIMEOUT_MS);
      }),
    ]);
    console.log(`[crawler] ok ${body.url} ${result.tookMs}ms blocked=${result.blocked} sections=${result.screenshots.desktopSections.length}`);
    send(res, 200, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'crawl failed';
    const blocked = /blocked|invalid url|only http|cannot resolve|credentials/i.test(msg);
    console.warn('[crawler] failed:', body.url, msg);
    send(res, blocked ? 422 : msg === 'crawl timed out' ? 504 : 500, { error: msg });
  } finally {
    clearTimeout(timer);
    release();
  }
});

server.requestTimeout = CRAWL_TIMEOUT_MS + 10_000;
server.listen(PORT, () => console.log(`[crawler] listening on :${PORT} (concurrency ${MAX_CONCURRENCY})`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    server.close();
    const b = await browserPromise?.catch(() => null);
    await b?.close().catch(() => {});
    process.exit(0);
  });
}
