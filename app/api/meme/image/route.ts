import { NextRequest } from 'next/server';
import { isAllowedImageHost } from '@/lib/memes';

/**
 * GET /api/meme/image?u=<https url>
 * Image proxy for /api/meme results: host allowlist, image types only (no SVG), size cap, long cache.
 * Not an open proxy: anything outside the allowlist is rejected.
 */

const MAX_BYTES = 6 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u');
  let target: URL;
  try {
    target = new URL(raw ?? '');
  } catch {
    return new Response('bad url', { status: 400 });
  }
  if (target.protocol !== 'https:' || !isAllowedImageHost(target.hostname)) {
    return new Response('host not allowed', { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RoastLab/1.0; +https://getroastlab.vercel.app)', Accept: 'image/*' },
      signal: AbortSignal.timeout(8_000),
      redirect: 'error',
    });
  } catch {
    return new Response('upstream failed', { status: 502 });
  }
  if (!upstream.ok) return new Response('upstream error', { status: 502 });

  const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(type)) return new Response('not an image', { status: 415 });
  if (Number(upstream.headers.get('content-length') ?? 0) > MAX_BYTES) return new Response('too large', { status: 413 });

  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response('too large', { status: 413 });

  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
