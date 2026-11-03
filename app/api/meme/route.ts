import { NextRequest, NextResponse } from 'next/server';
import { REDDIT_POOLS, hashStr, isSafeTitle, type MemeLang, type Mood } from '@/lib/memes';

/**
 * GET /api/meme?q=<giphy search>&lang=en|hi|te&mood=hype|roast&seed=<string>&exclude=<id,id>
 *
 * Filter + proxy: collects candidates (Giphy first, then the language's Reddit pools), drops anything
 * that is NSFW/spoiler/off-limits/too heavy/already shown, picks one deterministically from `seed`
 * (stable per audit, different between audits) and returns it behind /api/meme/image so the browser
 * never hotlinks a third party.
 *
 * Response: { url, rawUrl, id, source, lang } or { url: null } (rawUrl lets the client hotlink if the proxy ever fails)
 */

const MAX_GIF_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 6_000;

interface Meme {
  id: string;
  source: 'giphy' | 'reddit';
  rawUrl: string;
}

const proxied = (raw: string) => `/api/meme/image?u=${encodeURIComponent(raw)}`;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get('q')?.trim().slice(0, 80);
  const lang: MemeLang = p.get('lang') === 'hi' ? 'hi' : p.get('lang') === 'te' ? 'te' : 'en';
  const mood: Mood = p.get('mood') === 'hype' ? 'hype' : 'roast';
  const seed = (p.get('seed') ?? 'default').slice(0, 120);
  const exclude = new Set((p.get('exclude') ?? '').split(',').filter(Boolean).slice(0, 40));
  if (!q) return NextResponse.json({ url: null });

  const attempts: (() => Promise<Meme | null>)[] = [
    () => fromGiphy(q, lang, seed, exclude),
    () => fromReddit(lang, mood, seed, exclude),
  ];
  // Thin Telugu pools: fall back to the wider Indian-meme pool before giving up.
  if (lang === 'te') attempts.push(() => fromReddit('hi', mood, seed, exclude));

  for (const attempt of attempts) {
    try {
      const meme = await attempt();
      if (meme) return NextResponse.json({ url: proxied(meme.rawUrl), rawUrl: meme.rawUrl, id: meme.id, source: meme.source, lang });
    } catch {
      // try the next source
    }
  }
  return NextResponse.json({ url: null });
}

async function fromGiphy(q: string, lang: MemeLang, seed: string, exclude: Set<string>): Promise<Meme | null> {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({ api_key: apiKey, q, limit: '25', rating: 'pg', lang });
  const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params.toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: { id: string; title?: string; images?: { downsized_medium?: { url?: string; size?: string }; fixed_height?: { url?: string } } }[];
  };
  const candidates = (json.data ?? [])
    .filter((g) => !exclude.has(g.id) && isSafeTitle(g.title))
    .map((g) => ({ id: g.id, url: g.images?.downsized_medium?.url ?? g.images?.fixed_height?.url, size: Number(g.images?.downsized_medium?.size ?? 0) }))
    .filter((g): g is { id: string; url: string; size: number } => !!g.url && (g.size === 0 || g.size <= MAX_GIF_BYTES));
  if (candidates.length === 0) return null;

  const pick = candidates[hashStr(`${seed}:${q}`) % candidates.length];
  return { id: pick.id, source: 'giphy', rawUrl: pick.url };
}

async function fromReddit(lang: MemeLang, mood: Mood, seed: string, exclude: Set<string>): Promise<Meme | null> {
  const pool = REDDIT_POOLS[lang][mood];
  const start = hashStr(`${seed}:sub`) % pool.length;

  for (let i = 0; i < Math.min(3, pool.length); i++) {
    const sub = pool[(start + i) % pool.length];
    const res = await fetch(`https://meme-api.com/gimme/${sub}/20`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) continue;

    const json = (await res.json()) as { memes?: { postLink: string; title?: string; url: string; nsfw?: boolean; spoiler?: boolean; ups?: number }[] };
    const minUps = lang === 'en' ? 100 : 5; // smaller communities: keep the bar low enough that something passes
    const candidates = (json.memes ?? []).filter(
      (m) =>
        !m.nsfw &&
        !m.spoiler &&
        /\.(png|jpe?g|gif|webp)$/i.test(m.url) &&
        (m.ups ?? 0) >= minUps &&
        isSafeTitle(m.title) &&
        !exclude.has(m.postLink),
    );
    if (candidates.length === 0) continue;

    const pick = candidates[hashStr(`${seed}:${sub}`) % candidates.length];
    return { id: pick.postLink, source: 'reddit', rawUrl: pick.url };
  }
  return null;
}
