/**
 * Meme selection logic shared by the analyze page and /api/meme.
 * Pure functions only (no React, no fetch) so the rules stay easy to reason about.
 *
 * Rules (CLAUDE.md): score >= 65 -> HYPE, otherwise ROAST.
 */

export type MemeLang = 'en' | 'hi' | 'te';
export type LangPref = 'auto' | 'mix' | MemeLang;
export type Mood = 'hype' | 'roast';
export type Tone = 'hype' | 'mild' | 'harsh';

export const LANG_STORAGE_KEY = 'roastlab_meme_lang';
export const LANG_PREFS: { value: LangPref; label: string }[] = [
  { value: 'auto', label: 'AUTO' },
  { value: 'en', label: 'EN' },
  { value: 'hi', label: 'हिं' },
  { value: 'te', label: 'తె' },
  { value: 'mix', label: 'MIX' },
];

export function isLangPref(v: unknown): v is LangPref {
  return v === 'auto' || v === 'mix' || v === 'en' || v === 'hi' || v === 'te';
}

/* ─── seeded randomness ─────────────────────────────────────────────────── */

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickSeeded<T>(arr: readonly T[], seed: string): T {
  return arr[hashStr(seed) % arr.length];
}

/* ─── mood / tone / language ────────────────────────────────────────────── */

export const moodFor = (score: number): Mood => (score >= 65 ? 'hype' : 'roast');
export const toneFor = (score: number): Tone => (score >= 65 ? 'hype' : score >= 40 ? 'mild' : 'harsh');

/**
 * AUTO: a Telugu/Hindi browser gets that language; any other Indian-region browser gets a mix;
 * everyone else gets English. MIX picks a language per meme (stable for a given seed).
 */
export function resolveLang(pref: LangPref, browserLangs: readonly string[], seed: string): MemeLang {
  if (pref === 'en' || pref === 'hi' || pref === 'te') return pref;
  if (pref === 'mix') return pickSeeded(['en', 'hi', 'te'] as const, seed);
  for (const tag of browserLangs) {
    const primary = tag.toLowerCase().slice(0, 2);
    if (primary === 'te') return 'te';
    if (primary === 'hi') return 'hi';
  }
  if (browserLangs.some((t) => /-in$/i.test(t))) return pickSeeded(['en', 'hi', 'te'] as const, seed);
  return 'en';
}

/* ─── caption memes (template image + captions rendered in the browser) ─── */

// memegen.link ids that are classic top/bottom-text templates (verified against GET /templates).
export const TEMPLATES: Record<Tone, readonly string[]> = {
  hype: ['success', 'stonks', 'rollsafe', 'wonka'],
  mild: ['harold', 'sk', 'fry', 'spongebob', 'grumpycat'],
  harsh: ['facepalm', 'disastergirl', 'fine', 'bad', 'cb', 'awkward'],
};

export const DIM_NAMES: Record<MemeLang, Record<string, string>> = {
  en: {
    visual_design: 'visual design', copywriting: 'copy', cta: 'CTA button', ux_flow: 'UX flow',
    accessibility: 'accessibility', trust_signals: 'trust signals', mobile_experience: 'mobile view',
    performance: 'load speed', seo: 'SEO',
  },
  hi: {
    visual_design: 'विज़ुअल डिज़ाइन', copywriting: 'कॉपी', cta: 'CTA बटन', ux_flow: 'UX फ्लो',
    accessibility: 'एक्सेसिबिलिटी', trust_signals: 'ट्रस्ट सिग्नल', mobile_experience: 'मोबाइल व्यू',
    performance: 'लोडिंग स्पीड', seo: 'SEO',
  },
  te: {
    visual_design: 'విజువల్ డిజైన్', copywriting: 'కాపీ', cta: 'CTA బటన్', ux_flow: 'UX ఫ్లో',
    accessibility: 'యాక్సెసిబిలిటీ', trust_signals: 'ట్రస్ట్ సిగ్నల్స్', mobile_experience: 'మొబైల్ వ్యూ',
    performance: 'లోడింగ్ స్పీడ్', seo: 'SEO',
  },
};

type Caption = { top: string; bottom: string };

// {dim} = dimension name in the meme's language, {score} = that dimension's score.
export const CAPTIONS: Record<MemeLang, Record<Tone, readonly Caption[]>> = {
  en: {
    hype: [
      { top: '{dim} came in at {score}/100', bottom: 'and nobody had to beg' },
      { top: 'you: shipped the {dim}', bottom: 'the internet: ok that is clean' },
      { top: 'the {dim} looks like it had a plan', bottom: 'weird. respect.' },
      { top: '{dim}: {score}/100', bottom: 'lowkey proud of you' },
    ],
    mild: [
      { top: '{dim} is {score}/100', bottom: 'it is... a choice' },
      { top: 'me looking at your {dim}', bottom: 'could be worse. could be better too' },
      { top: 'the {dim} technically works', bottom: 'emotionally, no' },
      { top: '{score}/100 {dim}', bottom: 'mid. certified mid.' },
    ],
    harsh: [
      { top: 'your {dim} at {score}/100', bottom: 'my eyes filed for divorce' },
      { top: 'who approved this {dim}?', bottom: 'asking for the entire internet' },
      { top: 'user opens your {dim}', bottom: 'user opens a competitor' },
      { top: '{score}/100 {dim}', bottom: 'this is fine. it is not fine.' },
    ],
  },
  hi: {
    hype: [
      { top: '{dim} देखकर', bottom: 'दिल खुश हो गया भाई' },
      { top: '{dim} {score}/100', bottom: 'अरे वाह, सीधा कमाल!' },
      { top: 'इस {dim} को देखकर', bottom: 'बोले तो एकदम मस्त' },
      { top: '{dim} में दम है', bottom: '{score}/100, मान गए गुरु' },
    ],
    mild: [
      { top: '{dim} {score}/100', bottom: 'चलता है यार, बस चलता है' },
      { top: '{dim} देखा', bottom: 'ठीक-ठाक, पर और बेहतर हो सकता था' },
      { top: '{dim} बनाया तो है', bottom: 'पर दिल से नहीं बनाया' },
      { top: '{score}/100 {dim}', bottom: 'ना अच्छा, ना बुरा... बीच में लटका' },
    ],
    harsh: [
      { top: '{dim} देखकर', bottom: 'आंखों में आंसू आ गए भाई' },
      { top: 'ये {dim} किसने बनाया?', bottom: 'बता दो, नाराज़ नहीं होऊंगा' },
      { top: '{dim} {score}/100', bottom: 'भाई ये क्या कर दिया तूने' },
      { top: 'यूज़र ने {dim} खोला', bottom: 'और तुरंत बंद कर दिया' },
    ],
  },
  te: {
    hype: [
      { top: '{dim} చూసి', bottom: 'సూపర్ రా బాబు, అదుర్స్!' },
      { top: '{dim} {score}/100', bottom: 'ఇది కదా అసలైన మాస్' },
      { top: 'ఈ {dim} చూశాక', bottom: 'మనసు ఖుషీ అయిపోయింది' },
      { top: '{dim} లో దమ్ము ఉంది', bottom: '{score}/100, శభాష్ బ్రో' },
    ],
    mild: [
      { top: '{dim} {score}/100', bottom: 'పర్లేదు, ఓకే అంతే' },
      { top: '{dim} చూసి', bottom: 'బాగానే ఉంది... కానీ ఇంకా బాగుండాలి' },
      { top: '{dim} చేశారు గానీ', bottom: 'మనసు పెట్టి చేయలేదు బ్రో' },
      { top: '{score}/100 {dim}', bottom: 'మధ్యలో వేలాడుతోంది అంతే' },
    ],
    harsh: [
      { top: '{dim} చూసి', bottom: 'కళ్ళు మంటెక్కిపోయాయి బ్రో' },
      { top: 'ఈ {dim} ఎవరు చేశారు రా?', bottom: 'ఒకసారి కలవాలి' },
      { top: '{dim} {score}/100', bottom: 'ఏంటి బ్రో ఇది?' },
      { top: 'యూజర్ {dim} ఓపెన్ చేశాడు', bottom: 'వెంటనే క్లోజ్ చేశాడు' },
    ],
  },
};

export interface CaptionMemeSpec {
  template: string;
  top: string;
  bottom: string;
  lang: MemeLang;
}

export function buildCaptionMeme(opts: { lang: MemeLang; score: number; dimension?: string; seed: string }): CaptionMemeSpec {
  const { lang, score, dimension, seed } = opts;
  const tone = toneFor(score);
  const pair = pickSeeded(CAPTIONS[lang][tone], seed + ':caption');
  const dim = (dimension && DIM_NAMES[lang][dimension]) || (lang === 'en' ? 'site' : lang === 'hi' ? 'साइट' : 'సైట్');
  const fill = (t: string) => t.replace(/\{dim\}/g, dim).replace(/\{score\}/g, String(score));
  return { template: pickSeeded(TEMPLATES[tone], seed + ':tpl'), top: fill(pair.top), bottom: fill(pair.bottom), lang };
}

/* ─── real-meme search (Giphy) and Reddit pools ─────────────────────────── */

// Popular reaction characters per language/mood. Hindi = Bollywood/TV classics, Telugu = Tollywood.
const GIPHY_TERMS: Record<MemeLang, Record<Mood, readonly string[]>> = {
  en: {
    hype: ['mic drop', 'chefs kiss', 'slow clap', 'nailed it', 'victory dance'],
    roast: ['facepalm', 'this is fine', 'michael scott no', 'awkward monkey puppet', 'shocked pikachu', 'side eye'],
  },
  hi: {
    hype: ['shah rukh khan wow', 'amitabh bachchan wah', 'rajinikanth style', 'mogambo khush hua'],
    roast: ['hera pheri babu bhaiya', 'jethalal tarak mehta', 'paresh rawal hera pheri', 'munna bhai', 'bhide tarak mehta'],
  },
  te: {
    hype: ['allu arjun pushpa', 'mahesh babu', 'prabhas baahubali', 'jr ntr'],
    roast: ['brahmanandam', 'brahmanandam reaction', 'pawan kalyan', 'sunil telugu comedy'],
  },
};

// English roasts get a dimension-specific nudge so the GIF at least rhymes with the finding.
const EN_DIM_ROAST: Record<string, readonly string[]> = {
  visual_design: ['eyes burning', 'ugly sweater'],
  copywriting: ['reading confused', 'word salad'],
  cta: ['click button', 'pointing at button'],
  ux_flow: ['lost confused maze', 'where am i'],
  accessibility: ['squinting cant see', 'blind squint'],
  trust_signals: ['suspicious side eye', 'sketchy'],
  mobile_experience: ['tiny phone zoom', 'pinch zoom'],
  performance: ['waiting loading', 'slow internet'],
  seo: ['lost searching', 'google search'],
};

export function buildGiphyQuery(opts: { lang: MemeLang; mood: Mood; dimension?: string; seed: string }): string {
  const { lang, mood, dimension, seed } = opts;
  if (lang === 'en' && mood === 'roast' && dimension && EN_DIM_ROAST[dimension] && hashStr(seed + ':dimterm') % 2 === 0) {
    return pickSeeded(EN_DIM_ROAST[dimension], seed);
  }
  return pickSeeded(GIPHY_TERMS[lang][mood], seed);
}

export const REDDIT_POOLS: Record<MemeLang, Record<Mood, readonly string[]>> = {
  en: {
    roast: ['ProgrammerHumor', 'CrappyDesign', 'webdev', 'dankmemes'],
    hype: ['wholesomememes', 'MadeMeSmile', 'aww', 'wholesomegifs'],
  },
  hi: {
    roast: ['IndianDankMemes', 'IndianMeyMeys', 'desimemes', 'DesiMemeTemplates', 'IndianMemeTemplates', 'hindimemes'],
    hype: ['BollywoodMemes', 'IndianMeyMeys', 'desimemes', 'IndianMemeTemplates'],
  },
  te: {
    roast: ['Telugu_Memes', 'TollywoodMemes', 'TeluguCinema', 'IndianMemeTemplates'],
    hype: ['TollywoodMemes', 'Telugu_Memes', 'TeluguCinema', 'IndianMemeTemplates'],
  },
};

// Keeps politics, religion, caste, violence and slurs out of a product people share. Titles only; images are not inspected.
const BLOCKED_TITLE =
  /\b(modi|bjp|congress|kejriwal|rahul gandhi|election|politic\w*|hindu\w*|muslim\w*|islam\w*|christian\w*|dalit|caste|reservation|pakistan\w*|terror\w*|kill\w*|suicide|rape\w*|sex\w*|porn\w*|nude\w*|nsfw|fuck\w*|shit\w*|bitch\w*|cunt|dick|chutiya\w*|madarchod|behenchod|bhenchod|bhosd\w*|gaand|lund|randi|harami|mc|bc)\b/i;

export function isSafeTitle(title: string | undefined | null): boolean {
  return !title || !BLOCKED_TITLE.test(title);
}

export const IMAGE_HOST_ALLOWLIST = ['giphy.com', 'i.redd.it', 'preview.redd.it', 'i.imgur.com', 'api.memegen.link'] as const;

export function isAllowedImageHost(hostname: string): boolean {
  return IMAGE_HOST_ALLOWLIST.some((h) => hostname === h || hostname.endsWith('.' + h));
}

/* ─── placement plan ────────────────────────────────────────────────────── */

export type MemeKind = 'gif' | 'caption';
export interface MemePlacement {
  slot: 'hero' | 'card';
  dimension?: string;
  score: number;
  mood: Mood;
  kind: MemeKind;
  seedKey: string;
}
export interface MemePlan {
  hero: MemePlacement | null;
  byDimension: Record<string, MemePlacement>;
}

/**
 * One reaction GIF for the overall verdict, a finding-specific caption meme on the worst card,
 * a hype GIF on the best card, and (full audits) a second caption meme on the next-worst card.
 * Everything else stays meme-free so the findings stay readable.
 */
export function planMemes(dims: { dimension: string; score: number }[], overall: number | null, sessionSeed: string): MemePlan {
  const plan: MemePlan = { hero: null, byDimension: {} };
  if (overall !== null) {
    plan.hero = { slot: 'hero', score: overall, mood: moodFor(overall), kind: 'gif', seedKey: `${sessionSeed}:hero` };
  }
  if (dims.length === 0) return plan;

  const asc = [...dims].sort((a, b) => a.score - b.score || a.dimension.localeCompare(b.dimension));
  const card = (d: { dimension: string; score: number }, kind: MemeKind): MemePlacement => ({
    slot: 'card', dimension: d.dimension, score: d.score, mood: moodFor(d.score), kind, seedKey: `${sessionSeed}:${d.dimension}`,
  });

  const worst = asc[0];
  const best = asc[asc.length - 1];
  if (worst.score < 65) plan.byDimension[worst.dimension] = card(worst, 'caption');
  if (best.score >= 65 && best.dimension !== worst.dimension) plan.byDimension[best.dimension] = card(best, 'gif');
  if (dims.length >= 6 && asc[1].score < 65 && !plan.byDimension[asc[1].dimension]) plan.byDimension[asc[1].dimension] = card(asc[1], 'caption');
  return plan;
}
