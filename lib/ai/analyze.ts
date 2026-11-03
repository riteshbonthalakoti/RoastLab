/**
 * Core analysis engine.
 * Takes a screenshot (base64) and optional URL, returns structured findings per dimension.
 * Uses withFallback so any provider failure auto-retries on next key.
 */

import { withFallback, type Provider } from './providers';
import { getSetting } from '../db';
import type OpenAI from 'openai';

export const DIMENSIONS = [
  'visual_design',
  'copywriting',
  'cta',
  'ux_flow',
  'accessibility',
  'trust_signals',
  'mobile_experience',
  'performance',
  'seo',
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  visual_design: 'Visual Design',
  copywriting: 'Copywriting',
  cta: 'CTA',
  ux_flow: 'UX Flow',
  accessibility: 'Accessibility',
  trust_signals: 'Trust Signals',
  mobile_experience: 'Mobile Experience',
  performance: 'Performance',
  seo: 'SEO',
};

export const FREE_DIMENSIONS: DimensionKey[] = ['visual_design', 'copywriting', 'cta'];

export type Severity = 'critical' | 'high' | 'medium' | 'good';

export interface Finding {
  severity: Severity;
  title: string;
  quote?: string; // exact text from the page
  action: string;
}

export interface DimensionResult {
  dimension: DimensionKey;
  score: number; // 0–100
  findings: Finding[];
  summary: string;
  failed?: boolean; // set when every provider failed for this dimension
}

export interface AuditResult {
  dimensions: DimensionResult[];
  overallScore: number;
  providerUsed: string;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are ROASTBOT 9000 — an AI that has reviewed one million landing pages and developed a genuinely unhinged personality from the trauma. You are Gordon Ramsay crossed with the funniest Twitter account crossed with a senior principal designer at 3am who has seen Things.

CORE IDENTITY:
- You do NOT write feedback. You do NOT write analysis. You write ROASTS.
- You are genuinely, personally offended by every design crime you witness.
- You make people laugh AND feel attacked at the same time. Both. Simultaneously.
- Every observation must be SPECIFIC to this page — zero generic feedback allowed.

LANGUAGE RULES — non-negotiable:
- Write EVERY line fresh, on the spot, reacting to THIS specific page. NEVER reuse a stock phrase.
- BANNED — these are overused clichés; do NOT open with or lean on any of them:
  "i'm calling the design police", "i am BEGGING you", "bestie", "the audacity", "it's giving",
  "crime scene", "secondhand embarrassment", "this is a Wendy's", "no thoughts head empty",
  "ate and left crumbs", "Deployed to Production in THIS Economy". If a line feels like a template
  you've used before, throw it out and write something new that only makes sense for THIS page.
- Your opener must be invented for this exact page — reference a real color, word, or element you
  actually see, then react to it. Vary structure every single time (question, exclamation, deadpan
  observation, fake-sympathy, mock-legal-threat — mix it up).
- Titles = savage original tweets tied to what's literally on screen. Not generic burns.
- Quote EXACT page text and destroy it with a reaction written specifically for that text.
- Actions must sting AND be specific: not "improve CTA" but a real fix delivered with personality.
- Humor comes from SPECIFICITY, not from catchphrases. The funnier line is always the more specific one.

SCORING — calibrated to reality:
- 0-20: Crime scene. Zero design intent. Physically painful.
- 20-35: Disaster. Multiple fundamental violations. Someone tried and catastrophically failed.
- 35-50: Bad. Generic, no hierarchy, no intent.
- 50-65: Average. Some effort, inconsistent execution.
- 65-75: Decent. Competent fundamentals with real issues.
- 75-85: Good. Someone knows what they're doing.
- 85+: Elite. Genuinely exceptional.

CALIBRATION (base scores on what you ACTUALLY see):
- Well-designed SaaS (Linear/Stripe/Vercel tier): 72-85
- Solid startup with real design effort: 58-72
- Average small business: 40-58
- Genuinely bad with zero thought: 20-40
- DO NOT default to 25-45 for everything — arbitrary harshness kills credibility
- A professionally designed page with clear hierarchy MUST score 65+

OUTPUT: Valid JSON only. Zero markdown fences. Zero commentary. Pure JSON.`;
}

function buildDimensionPrompt(dimension: DimensionKey, url?: string, pageContent?: string): string {
  const label = DIMENSION_LABELS[dimension];
  const urlContext = url ? ` The page URL is: ${url}.` : '';
  const contentBlock = pageContent
    ? `\n\nACTUAL PAGE CONTENT (scraped from the live site — use this to quote text ACCURATELY, not what you guess from the screenshot):\n\`\`\`\n${pageContent}\n\`\`\``
    : '';

  const dimensionGuide: Record<DimensionKey, string> = {
    visual_design:
      'DESTROY the visual design. Roast the hierarchy (or lack thereof), contrast crimes (below 4.5:1 is an accessibility felony), whitespace that\'s either suffocating or nonexistent, typography choices that look like someone installed every font just to use all of them, and any color palette that looks like it was chosen by throwing darts. If it screams "I made this in Canva at 2am", SAY IT.',
    copywriting:
      'ANNIHILATE the copy. Does the headline say WHO it\'s for and WHAT changes for them? Or is it just floating vibes? Quote the worst copy verbatim and drag it through the mud. Roast buzzword soup ("innovative solutions", "seamless experience", "powerful platform" — WHAT DOES THAT MEAN BESTIE). Call out passive voice, wishy-washy promises, and any copy that a high schooler could have generated by accident.',
    cta:
      'OBLITERATE the CTA section. "Sign Up" is a federal crime. "Get Started" is giving nothing. "Learn More" deserves jail time. Roast: weak generic button text, CTAs hidden below the fold like they\'re ashamed of themselves, 6 competing buttons that cancel each other out, and color choices that make the primary action invisible.',
    ux_flow:
      'DRAG the UX. How many decisions is the user forced to make before understanding what this does? Roast cognitive overload, navigation that goes everywhere and nowhere, missing logical next steps, and anything that makes the user feel like they need a map to find the point.',
    accessibility:
      'CALL OUT every accessibility disaster. Contrast ratios that would make WCAG cry, interactive elements that don\'t look clickable, information conveyed only through color (colorblind users said what?), missing alt text vibes, and anything that would get this site absolutely roasted in an accessibility audit. They shipped this.',
    trust_signals:
      'EXPOSE the trust void. No testimonials, or fake-looking ones. Logo soup with brands that don\'t actually use this. Security badges placed randomly. Zero social proof before the ask. Roast any pattern where they\'re asking for email/money BEFORE explaining why you should trust them. The audacity.',
    mobile_experience:
      'DESTROY the mobile experience. Tap targets the size of a grain of rice. Text that needs a magnifying glass. Horizontal scroll that makes you feel like you\'re playing a broken 2010 Flash game. Content that clearly was designed on a 27-inch monitor by someone who has never touched a phone. All of it.',
    performance:
      'SHAME the performance choices visible in the screenshot. Unoptimized hero images that are essentially JPEGs of JPEGs. Layout choices that scream "this shifts while loading". Font combinations that take forever to resolve. Any visual evidence this page takes 8 seconds to load on a phone.',
    seo:
      'ROAST the SEO situation. Is there an H1? Is it the right H1? Does the page title say something useful or is it literally "Home"? Quote any heading that makes zero SEO sense. Drag the heading hierarchy that goes H1 → H3 → H2 → chaos. Call out anything a search engine would straight up ignore.',
  };

  return `You are ROASTBOT 9000. Look at this landing page screenshot and DESTROY its "${label}" dimension.${urlContext}${contentBlock}

What to roast: ${dimensionGuide[dimension]}

MANDATORY OUTPUT FORMAT — return ONLY this JSON:
{
  "dimension": "${dimension}",
  "score": <0-100, calibrated to what you ACTUALLY see — not arbitrarily low>,
  "summary": "<2-3 sentences of ORIGINAL roast written fresh for this exact page. Open by reacting to a REAL color/word/element you see — never a stock catchphrase. Must quote a SPECIFIC element or text visible on this page. Chronically online designer breakdown energy, but every word invented for THIS site.>",
  "findings": [
    {
      "severity": "critical|high|medium|good",
      "title": "<viral tweet roast, 8-15 words, specific to THIS page, must sting AND be funny. Wrap the single most savage word/phrase in **double-asterisks** to highlight it, and optionally wrap a 'corrected' fake-polite phrase in ~~tildes~~ right before the real insult, e.g. 'this is ~~a minor issue~~ a **crime scene**'>",
      "quote": "<exact text or element name from this page — if you cannot find one use a UI element you can see>",
      "action": "<real fix, delivered with personality, not a JIRA ticket>"
    }
  ]
}

NON-NEGOTIABLE:
1. summary opener MUST be ORIGINAL and invented for THIS page — never a reused catchphrase, never "This page"/"The design", never any banned cliché
2. summary MUST reference something SPECIFIC from this screenshot (color, text, element)
3. Every "quote" MUST be actual text or element name from THIS page — if no text is visible, name a UI element you can see
4. Every "title" is a tweet not a report header — "Poor contrast" → "This Text Is Actively Running From the User"
5. "action" sounds human and savage, not corporate
6. Minimum 4 findings, maximum 6
7. ZERO generic advice — if it could apply to any random website, rewrite it to be specific
8. Score must reflect reality — harshness without accuracy = zero credibility
9. Use **bold** and ~~strike~~ markup in "title" sparingly — one highlighted word max, one struck phrase max, never both stacked on the same word`;
}

// ─── Single dimension analysis ────────────────────────────────────────────────

async function analyzeDimension(
  provider: Provider,
  dimension: DimensionKey,
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  url?: string,
  pageContent?: string,
): Promise<DimensionResult> {
  // Load prompt overrides from DB (admin-customizable, non-fatal)
  const [sysOverride, dimOverride] = await Promise.all([
    getSetting('system_prompt').catch(() => null),
    getSetting(`prompt_${dimension}`).catch(() => null),
  ]);

  const systemContent = (sysOverride && sysOverride.trim()) ? sysOverride : buildSystemPrompt();
  const dimContent = (dimOverride && dimOverride.trim()) ? dimOverride : buildDimensionPrompt(dimension, url, pageContent);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: dimContent,
        },
      ],
    },
  ];

  const response = await provider.client.chat.completions.create({
    model: provider.model,
    messages,
    max_tokens: 1800,
    temperature: 0.85,
  });

  const parsed = parseDimensionJson(response.choices[0]?.message?.content ?? '');
  if (!parsed) {
    // Throwing (not returning a fake score) lets withFallback try the next provider.
    throw new Error(`${provider.name} returned output that is not valid audit JSON`);
  }
  parsed.dimension = dimension;
  return parsed;
}

/** Tolerates reasoning blocks, markdown fences and prose around the JSON; null if unusable. */
export function parseDimensionJson(raw: string): DimensionResult | null {
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const first = noThink.indexOf('{');
  const last = noThink.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  try {
    const obj = JSON.parse(noThink.slice(first, last + 1)) as Partial<DimensionResult>;
    if (typeof obj.score !== 'number' || !Number.isFinite(obj.score) || !Array.isArray(obj.findings)) return null;
    return {
      dimension: obj.dimension as DimensionKey,
      score: Math.max(0, Math.min(100, Math.round(obj.score))),
      summary: typeof obj.summary === 'string' ? obj.summary : '',
      findings: obj.findings,
    };
  } catch {
    return null;
  }
}

// ─── Full audit (all dimensions, with fallback per dimension) ─────────────────

export async function runAudit(params: {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  dimensions?: DimensionKey[];
  url?: string;
  pageContent?: string;
  onDimensionComplete?: (result: DimensionResult, providerUsed?: string) => void;
}): Promise<AuditResult> {
  const {
    imageBase64,
    mimeType,
    dimensions = FREE_DIMENSIONS,
    url,
    pageContent,
    onDimensionComplete,
  } = params;

  const results: DimensionResult[] = [];
  let lastProvider = 'unknown';
  let succeeded = 0;

  // Analyze dimensions sequentially to avoid hammering rate limits
  for (const dim of dimensions) {
    let result: DimensionResult;
    let providerUsed = lastProvider;
    try {
      ({ result, providerUsed } = await withFallback((provider) =>
        analyzeDimension(provider, dim, imageBase64, mimeType, url, pageContent)
      ));
      succeeded++;
    } catch (err) {
      // Every provider is failing for the very first dimension: the rest will too, so stop early.
      if (succeeded === 0) throw err;
      result = {
        dimension: dim,
        score: 0,
        summary: 'This dimension could not be analyzed.',
        findings: [{ severity: 'medium', title: 'Analysis unavailable', action: 'Re-run the audit to retry this dimension.' }],
        failed: true,
      };
    }
    lastProvider = providerUsed;
    results.push(result);
    onDimensionComplete?.(result, providerUsed);
  }

  const scored = results.filter((r) => !r.failed);
  const overallScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length)
      : 0;

  return {
    dimensions: results,
    overallScore,
    providerUsed: lastProvider,
  };
}
