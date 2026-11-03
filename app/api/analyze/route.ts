/**
 * POST /api/analyze
 * Multipart: screenshot (File) OR url (string) + tier ("free"|"full")
 * Returns SSE stream — no DB required.
 */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { runAudit, FREE_DIMENSIONS, DIMENSIONS, type DimensionResult } from '@/lib/ai/analyze';
import { captureScreenshot, captureMultipleScreenshots, crawlPage, extractSiteData, crawlSubpages } from '@/lib/screenshot';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { saveAudit, logApiUsage } from '@/lib/db';
import { sendAuditEmail } from '@/lib/email';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'bonthalamadhavi1@gmail.com,ritesh@gratiantechnologies.com')
  .split(',').map(e => e.trim().toLowerCase());

export const runtime = 'nodejs';
export const maxDuration = 120;

// Provider/internal error text (model IDs, status codes) means nothing to users; log it, show something readable.
function userFacingError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  const status = (err as { status?: number } | null)?.status;
  if (/screenshot|microlink/i.test(msg)) {
    return "We couldn't capture that site. It may block automated visitors or be down. Try another URL or upload a screenshot instead.";
  }
  if (status === 429 || status === 403) {
    return 'Our AI roasters are slammed right now. Give it a minute and try again.';
  }
  return 'Something broke on our side while roasting. Try again in a moment.';
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // Admin detection via Clerk
        const clerkUser = await currentUser();
        const userEmail = clerkUser?.emailAddresses[0]?.emailAddress?.toLowerCase() ?? '';
        const isAdmin = ADMIN_EMAILS.includes(userEmail);

        const formData = await req.formData();
        const file = formData.get('screenshot') as File | null;
        const url = (formData.get('url') as string | null) ?? undefined;
        const rawTier = ((formData.get('tier') as string | null) ?? 'free') as 'free' | 'full';
        const rawPaid = formData.get('paid') === '1';

        // Admin gets full access always
        const tier: 'free' | 'full' = isAdmin ? 'full' : rawTier;
        const paid = isAdmin ? true : rawPaid;
        const rawBase64 = formData.get('imageBase64') as string | null;
        const rawMime = (formData.get('imageMimeType') as string | null) ?? 'image/png';

        // Rate limit only for free (unpaid) requests
        if (!paid) {
          const ip = getClientIp(req);
          const limit = checkRateLimit(ip);
          if (!limit.allowed) {
            const resetIn = Math.ceil((limit.resetAt - Date.now()) / 1000 / 60 / 60);
            send({
              type: 'error',
              payload: {
                message: `You've used your 5 free roasts for today 😤 Come back in ~${resetIn}h, or unlock unlimited with the full plan.`,
                rateLimited: true,
              },
            });
            controller.close();
            return;
          }
        }

        if (!file && !url && !rawBase64) {
          send({ type: 'error', payload: { message: 'Provide a screenshot or URL.' } });
          controller.close();
          return;
        }

        let imageBase64: string;
        let mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
        let pageContent: string | undefined;

        if (rawBase64) {
          imageBase64 = rawBase64;
          mimeType = (['image/jpeg', 'image/png', 'image/webp'].includes(rawMime)
            ? rawMime : 'image/png') as 'image/jpeg' | 'image/png' | 'image/webp';
          send({ type: 'status', payload: { message: 'Got your screenshot, loading roast cannon…' } });
        } else if (file) {
          const allowed = ['image/jpeg', 'image/png', 'image/webp'];
          if (!allowed.includes(file.type)) {
            send({ type: 'error', payload: { message: 'Use JPEG, PNG, or WebP.' } });
            controller.close();
            return;
          }
          if (file.size > 10 * 1024 * 1024) {
            send({ type: 'error', payload: { message: 'Screenshot too large (max 10 MB).' } });
            controller.close();
            return;
          }
          const bytes = await file.arrayBuffer();
          imageBase64 = Buffer.from(bytes).toString('base64');
          mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
          send({ type: 'status', payload: { message: 'Got your screenshot, loading roast cannon…' } });
        } else {
          const isPremium = tier === 'full' || paid;

          // Both free + full tiers get full crawl + multi-screenshot capture —
          // free tier just analyzes fewer dimensions afterward, not less data.
          send({ type: 'status', payload: { message: 'Website live hai ya nahi check kar rahe hain — bot-check clear hone ka wait…' } });

          const [captured, multiShots, mainCrawl, siteData, subpageData] = await Promise.all([
            captureScreenshot(url!),
            captureMultipleScreenshots(url!),
            crawlPage(url!),
            extractSiteData(url!),
            isPremium ? crawlSubpages(url!) : Promise.resolve(''),
          ]);

          imageBase64 = captured.base64;
          mimeType = captured.mimeType;

          // Stream screenshots one at a time — narrates as "scroll down → capture section"
          const allShots = [captured.screenshotUrl, ...multiShots.filter(u => u !== captured.screenshotUrl)];
          for (let i = 0; i < allShots.length; i++) {
            const sectionMsg = i === 0
              ? 'Capturing hero section (top of page)…'
              : i === allShots.length - 1
              ? 'Scrolled to footer — capturing final section…'
              : `Scrolling down — capturing section ${i + 1}/${allShots.length}…`;
            send({ type: 'status', payload: { message: sectionMsg } });
            send({ type: 'screenshot', payload: { url: allShots[i] } });
            // ~1s per section so it visibly reads as scrolling down the page,
            // not a single instant dump of every capture at once
            if (i < allShots.length - 1) await new Promise(r => setTimeout(r, 950));
          }

          const parts = [mainCrawl, siteData, subpageData].filter(p => p && p.length > 50);
          pageContent = parts.join('\n\n---\n\n') || undefined;

          const totalChars = parts.reduce((s, p) => s + p.length, 0);
          send({
            type: 'status',
            payload: {
              message: totalChars > 0
                ? `Crawl complete — ${totalChars.toLocaleString()} chars analyzed across ${parts.length} data sources. Unleashing roast cannon…`
                : 'Screenshots captured — loading roast cannon…',
            },
          });
        }

        const dimensions = tier === 'full' ? [...DIMENSIONS] : [...FREE_DIMENSIONS];

        let dimCount = 0;
        const result = await runAudit({
          imageBase64,
          mimeType,
          dimensions,
          url,
          pageContent,
          onDimensionComplete: async (dimResult: DimensionResult, providerUsed?: string) => {
            dimCount++;
            send({
              type: 'dimension',
              payload: { ...dimResult, _provider: providerUsed, _seq: dimCount },
            });
          },
        });

        // Persist audit + email for every signed-in user.
        // MUST await before the stream closes — Vercel freezes the function's
        // execution context right after controller.close(), killing any
        // still-pending fire-and-forget promise (DB write, email) mid-flight.
        if (clerkUser) {
          const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
          const userName = clerkUser.firstName ?? undefined;
          const auditUrl = url ?? 'screenshot-upload';

          await Promise.allSettled([
            saveAudit({
              userId: clerkUser.id,
              url: auditUrl,
              score: result.overallScore,
              tier,
              dimensions: result.dimensions,
            }),
            userEmail
              ? sendAuditEmail({
                  to: userEmail,
                  name: userName,
                  url: auditUrl,
                  score: result.overallScore,
                  dims: result.dimensions,
                  tier,
                  userId: clerkUser.id,
                })
              : Promise.resolve(),
            result.providerUsed
              ? logApiUsage({
                  userId: clerkUser.id,
                  provider: result.providerUsed,
                  model: result.providerUsed,
                  tokensIn: 0,
                  tokensOut: 0,
                })
              : Promise.resolve(),
          ]);
        }

        send({
          type: 'done',
          payload: {
            overallScore: result.overallScore,
            providerUsed: result.providerUsed,
          },
        });
      } catch (err) {
        console.error('[analyze] failed:', err);
        send({ type: 'error', payload: { message: userFacingError(err) } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
