# RoastLab crawler

A small container service that opens a URL in a real headless Chromium and returns everything the roast needs:

- full-page desktop screenshots, pre-cropped into 900px sections (max 18) plus two 390px mobile shots
- a `designMd` string (DESIGN.md): theme colors, typography, layout, CTAs, content outline, trust signals, measured WCAG contrast, mobile tap targets/overflow, performance, SEO, other pages, and the page's verbatim text
- the raw `facts` JSON behind it

The Next.js app calls it through `lib/crawler.ts`. If `CRAWLER_URL`/`CRAWLER_TOKEN` are unset, or the crawl fails or hits a bot-block page, the app falls back to Firecrawl and then the legacy thum.io/Jina path.

## API

```
GET  /health
POST /crawl   Authorization: Bearer $CRAWLER_TOKEN
              { "url": "https://example.com", "subpages": true }
```

Errors: `401` bad token, `422` URL rejected (non-http(s), private/loopback/link-local address), `503` busy, `504` timed out.

## Run

```bash
cd crawler
docker build -t roastlab-crawler .
docker run --rm -p 8080:8080 --ipc=host -e CRAWLER_TOKEN=$(openssl rand -hex 24) roastlab-crawler
```

Local without Docker: `npm install && CRAWLER_TOKEN=<16+ chars> npm start` (needs Playwright's Chromium: `npx playwright install chromium`).

| Env var | Default | Purpose |
|---|---|---|
| `CRAWLER_TOKEN` | required (16+ chars) | Bearer token; the service refuses to start without it |
| `PORT` | 8080 | |
| `MAX_CONCURRENCY` | 2 | simultaneous crawls; more are queued for 20s then get 503 |
| `CRAWL_TIMEOUT_MS` | 80000 | hard cap per crawl |

Give the container at least 1 GB RAM (2 GB if `MAX_CONCURRENCY` > 2). Any container host works (Fly.io, Railway, Render, Cloud Run, a VPS). Prefer one with a residential-quality egress IP if you crawl bot-protected sites; datacenter IPs get challenged more often.

## Wire it to the app

Add to the Vercel project (Production and Preview):

```
CRAWLER_URL=https://<your-crawler-host>
CRAWLER_TOKEN=<same token>
```

## Safety

- Auth is required on `/crawl`.
- Every navigation and subresource host is resolved and rejected if it maps to a private, loopback, link-local, CGNAT or multicast address (also applies to redirects). DNS rebinding between the check and the connection is not fully closed; run the container without access to internal networks.
- Page content is untrusted. `designMd` quotes the site verbatim, so treat it as data when prompting a model.
