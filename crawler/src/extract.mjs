/*
 * These functions are serialized and run INSIDE the page via page.evaluate().
 * They must be fully self-contained: no imports, no references to module scope.
 */

export function extractDesktop() {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'TEMPLATE', 'HEAD', 'META', 'LINK']);
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  // Canvas normalises any CSS color syntax (rgb, oklch, color-mix, ...) to RGBA.
  const parse = (c) => {
    if (!c) return null;
    if (colorCache.has(c)) return colorCache.get(c);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    colorCache.set(c, out);
    return out;
  };
  const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('') : null);
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const saturation = (c) => {
    const mx = Math.max(c.r, c.g, c.b);
    const mn = Math.min(c.r, c.g, c.b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  const effectiveBg = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null; // gradient/image: contrast unknowable
      const c = parse(s.backgroundColor);
      if (c && c.a > 0.95) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  // Some sites render headings twice (visible + screen-reader/animation copy): collapse "X X" to "X".
  const text = (el) => {
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const half = Math.floor(t.length / 2);
    return t.length > 10 && t.length % 2 === 1 && t.slice(0, half) === t.slice(half + 1) ? t.slice(0, half) : t;
  };
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const ownTextLen = (el) => [...el.childNodes].reduce((s, n) => s + (n.nodeType === 3 ? n.textContent.trim().length : 0), 0);
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const bump = (map, k, w) => map.set(k, (map.get(k) || 0) + w);
  const pageH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);

  // ---------- text elements: typography, text colors, contrast ----------
  const textEls = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP.has(el.tagName.toUpperCase())) continue;
    if (!hasOwnText(el)) continue;
    if (!vis(el)) continue;
    textEls.push(el);
    if (textEls.length >= 700) break;
  }

  const families = new Map();
  const sizes = new Map();
  const textColors = new Map();
  const weights = new Map();
  const lineHeights = [];
  const contrastFails = [];
  let contrastChecked = 0;
  let contrastUnknown = 0;
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const len = ownTextLen(el);
    const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const px = Math.round(parseFloat(s.fontSize));
    bump(families, fam, len);
    bump(sizes, px, len);
    bump(weights, s.fontWeight, len);
    const fg = parse(s.color);
    if (fg) bump(textColors, hex(fg), len);
    if (/^(P|LI)$/.test(el.tagName) && s.lineHeight !== 'normal') lineHeights.push(parseFloat(s.lineHeight) / parseFloat(s.fontSize));
    const bg = effectiveBg(el);
    if (!fg || !bg) {
      contrastUnknown++;
      continue;
    }
    contrastChecked++;
    const r = ratio(fg, bg);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    if (r < (large ? 3 : 4.5)) {
      contrastFails.push({ text: text(el).slice(0, 50), fg: hex(fg), bg: hex(bg), ratio: Math.round(r * 100) / 100, size: px });
    }
  }
  contrastFails.sort((a, b) => a.ratio - b.ratio);

  // ---------- headings ----------
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(vis)
    .map((h) => ({ level: Number(h.tagName[1]), text: text(h).slice(0, 140), size: Math.round(parseFloat(getComputedStyle(h).fontSize)) }))
    .filter((h) => h.text)
    .slice(0, 45);
  const h1El = [...document.querySelectorAll('h1')].find(vis);
  let heroSub = null;
  if (h1El) {
    const after = [...document.querySelectorAll('p,h2')].find((p) => vis(p) && (h1El.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) && text(p).length > 20);
    heroSub = after ? text(after).slice(0, 220) : null;
  }
  let headingSkips = 0;
  for (let i = 1; i < headings.length; i++) if (headings[i].level - headings[i - 1].level > 1) headingSkips++;

  // ---------- CTAs ----------
  const GENERIC = /^(sign ?up|get started|learn more|read more|submit|click here|continue|more|see more|find out more|start now|join now|try now|go)$/i;
  const ctaMap = new Map();
  for (const el of document.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const cls = (typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '');
    const bgC = parse(s.backgroundColor);
    const hasBg = !!bgC && bgC.a > 0.5;
    const borderC = parse(s.borderTopColor);
    const hasBorder = parseFloat(s.borderTopWidth) > 0 && !!borderC && borderC.a > 0.3;
    const classHint = /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i.test(cls);
    // Plain text buttons/links (nav items, app-mockup rows inside hero screenshots) are not CTAs:
    // require a filled/outlined shape, an explicit btn/cta class, or a submit input.
    const btnLike = el.tagName === 'INPUT' || classHint || ((el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') && (hasBg || hasBorder) && r.height >= 28);
    if (!btnLike) continue;
    const label = (el.tagName === 'INPUT' ? el.value : text(el)).slice(0, 60);
    if (!label) continue;
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    const key = label + '|' + href;
    if (ctaMap.has(key)) continue;
    const fg = parse(s.color);
    const bg = effectiveBg(el);
    ctaMap.set(key, {
      label,
      tag: el.tagName.toLowerCase(),
      href: href ? href.slice(0, 80) : null,
      aboveFold: r.top < vh && r.bottom > 0,
      inNav: !!el.closest('nav,header'),
      bg: hasBg ? hex(bgC) : null,
      fg: fg ? hex(fg) : null,
      fontSize: Math.round(parseFloat(s.fontSize)),
      w: Math.round(r.width),
      h: Math.round(r.height),
      radius: s.borderRadius,
      contrast: fg && bg ? Math.round(ratio(fg, bg) * 100) / 100 : null,
      generic: GENERIC.test(label),
    });
    if (ctaMap.size >= 30) break;
  }
  const ctas = [...ctaMap.values()];

  // ---------- navigation ----------
  const navLinks = [];
  const seenNav = new Set();
  for (const a of document.querySelectorAll('header a[href], nav a[href]')) {
    if (!vis(a)) continue;
    const t = text(a);
    if (!t || t.length > 30 || seenNav.has(t)) continue;
    seenNav.add(t);
    navLinks.push({ text: t, href: a.getAttribute('href').slice(0, 100) });
    if (navLinks.length >= 20) break;
  }

  // ---------- colors ----------
  const bgAreas = new Map();
  const accentVotes = new Map();
  let scanned = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (++scanned > 2500) break;
    if (SKIP.has(el.tagName.toUpperCase())) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 12) continue;
    const s = getComputedStyle(el);
    const c = parse(s.backgroundColor);
    if (c && c.a > 0.5) {
      bump(bgAreas, hex(c), Math.round(Math.min(r.width, vw) * Math.min(r.height, pageH)));
      if (saturation(c) > 0.35) bump(accentVotes, hex(c), 1);
    }
    if (el.tagName === 'A' || el.tagName === 'BUTTON') {
      const fg = parse(s.color);
      if (fg && saturation(fg) > 0.35 && lum(fg) > 0.02) bump(accentVotes, hex(fg), 1);
    }
  }
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
  const htmlBg = parse(getComputedStyle(document.documentElement).backgroundColor);
  const pageBg = (bodyBg && bodyBg.a > 0.5 ? bodyBg : htmlBg && htmlBg.a > 0.5 ? htmlBg : { r: 255, g: 255, b: 255, a: 1 });
  const ctaBgVotes = new Map();
  for (const c of ctas) if (c.bg && !c.inNav) bump(ctaBgVotes, c.bg, 1);
  const accent = top(ctaBgVotes, 1)[0]?.[0] || top(accentVotes, 1)[0]?.[0] || null;

  // ---------- CSS variables (design tokens) ----------
  const cssVars = [];
  try {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin stylesheet
      }
      for (const rule of rules || []) {
        if (rule.selectorText && /^(:root|html|body)$/.test(rule.selectorText.trim())) {
          for (const name of rule.style) if (name.startsWith('--') && cssVars.length < 40) cssVars.push([name, rule.style.getPropertyValue(name).trim().slice(0, 60)]);
        }
      }
      if (cssVars.length >= 40) break;
    }
  } catch {
    // ignore
  }

  // ---------- layout: container width, radii, shadows, sections ----------
  const widths = new Map();
  const radii = new Map();
  let shadows = 0;
  let cards = 0;
  scanned = 0;
  for (const el of document.body.querySelectorAll('div,section,main,article,header,footer,ul')) {
    if (++scanned > 1500) break;
    const r = el.getBoundingClientRect();
    if (r.width >= 640 && r.width < vw - 2 && r.height > 40) bump(widths, Math.round(r.width / 10) * 10, 1);
    const s = getComputedStyle(el);
    if (s.boxShadow && s.boxShadow !== 'none') shadows++;
    if (r.width >= 100 && r.height >= 60 && s.borderRadius !== '0px') {
      const bgc = parse(s.backgroundColor);
      if ((bgc && bgc.a > 0.5) || s.borderTopWidth !== '0px') {
        bump(radii, s.borderRadius, 1);
        cards++;
      }
    }
  }
  const sectionCount = document.querySelectorAll('section').length;

  // ---------- images ----------
  const imgs = [...document.images].filter(vis);
  const images = {
    total: imgs.length,
    missingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
    emptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
    aboveFold: imgs.filter((i) => i.getBoundingClientRect().top < vh).length,
    oversized: imgs.filter((i) => i.naturalWidth > 0 && i.naturalWidth > i.getBoundingClientRect().width * 2.5).length,
    lazy: imgs.filter((i) => i.loading === 'lazy').length,
    svg: document.querySelectorAll('svg').length,
    video: document.querySelectorAll('video').length,
  };

  // ---------- forms ----------
  const inputs = [...document.querySelectorAll('input,select,textarea')].filter((i) => vis(i) && !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(i.type));
  const labelled = inputs.filter((i) => i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || (i.id && document.querySelector('label[for="' + CSS.escape(i.id) + '"]')) || i.closest('label')).length;
  const forms = { count: document.forms.length, inputs: inputs.length, labelled, placeholderOnly: inputs.length - labelled };

  // ---------- links ----------
  const anchors = [...document.querySelectorAll('a[href]')];
  const host = location.hostname;
  let internal = 0;
  let external = 0;
  let dead = 0;
  const social = new Set();
  for (const a of anchors) {
    const h = a.getAttribute('href').trim();
    if (!h || h === '#' || h.startsWith('javascript:')) {
      dead++;
      continue;
    }
    try {
      const u = new URL(h, location.href);
      if (u.hostname === host) internal++;
      else external++;
      const m = u.hostname.match(/(twitter|x|linkedin|facebook|instagram|youtube|github|tiktok|discord)\.(com)/);
      if (m) social.add(m[1]);
    } catch {
      dead++;
    }
  }
  const linkText = anchors.map((a) => (text(a) + ' ' + a.getAttribute('href')).toLowerCase()).join(' | ');
  const links = {
    total: anchors.length,
    internal,
    external,
    dead,
    social: [...social],
    privacy: /privacy/.test(linkText),
    terms: /terms|tos/.test(linkText),
    contact: /contact|mailto:|tel:/.test(linkText),
  };

  // ---------- trust signals (text-based, factual) ----------
  const body = (document.body.innerText || '').slice(0, 250000);
  const lower = body.toLowerCase();
  const find = (re) => {
    const m = lower.match(re);
    return m ? m[0] : null;
  };
  const trust = {
    testimonials: find(/testimonial|what (our )?(customers|users|clients) say|loved by|customer stories|case stud(y|ies)/),
    trustedBy: find(/trusted by|used by|powering|customers include|as seen (in|on)/),
    ratings: find(/\d(\.\d)?\s*\/\s*5|★|⭐|\d(\.\d)?\s*stars?|g2|capterra|trustpilot|product hunt/),
    numbers: [...body.matchAll(/\b\d{1,3}(?:,\d{3})+\+?|\b\d+(?:\.\d+)?\s?[kKmM]\+|\b\d{2,}\+\s?(?:customers|users|teams|companies|businesses)/g)].map((m) => m[0]).slice(0, 5),
    guarantee: find(/money[- ]back|guarantee|refund|no credit card|cancel anytime|free trial/),
    security: find(/\bssl\b|secure|gdpr|soc ?2|iso ?27001|hipaa|encrypted|pci/),
    logoImages: [...document.images].filter((i) => /logo|brand|partner|client/i.test((i.alt || '') + (i.src || ''))).length,
    pricing: /(\$|€|£|₹)\s?\d/.test(body) || /\bpricing\b/.test(lower),
    faq: /\bfaq\b|frequently asked/.test(lower),
    chatWidget: !!document.querySelector('[id*="intercom"],[id*="drift"],[id*="crisp"],[class*="intercom"],iframe[src*="tawk"],iframe[src*="crisp"]'),
  };

  // ---------- accessibility basics ----------
  const unnamedButtons = [...document.querySelectorAll('button,[role="button"],a')].filter(
    (e) => vis(e) && !text(e) && !e.getAttribute('aria-label') && !e.getAttribute('title') && !e.querySelector('img[alt]:not([alt=""])'),
  ).length;
  const a11y = {
    lang: document.documentElement.getAttribute('lang') || null,
    contrastChecked,
    contrastUnknown,
    contrastFailCount: contrastFails.length,
    contrastWorst: contrastFails.slice(0, 5),
    unnamedInteractive: unnamedButtons,
    landmarks: ['header', 'nav', 'main', 'footer'].filter((t) => document.querySelector(t)).length,
    skipLink: !!document.querySelector('a[href^="#"][class*="skip"],a[href="#main"],a[href="#content"]'),
  };

  // ---------- SEO ----------
  const m = (sel) => document.querySelector(sel)?.getAttribute('content') || null;
  const jsonLd = [];
  for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(sc.textContent);
      for (const d of Array.isArray(data) ? data : [data]) if (d && d['@type']) jsonLd.push(String(d['@type']));
    } catch {
      // ignore malformed JSON-LD
    }
  }
  const seo = {
    title: document.title || null,
    titleLen: (document.title || '').length,
    description: m('meta[name="description"]'),
    descriptionLen: (m('meta[name="description"]') || '').length,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
    robots: m('meta[name="robots"]'),
    viewport: m('meta[name="viewport"]'),
    ogTitle: m('meta[property="og:title"]'),
    ogImage: m('meta[property="og:image"]'),
    twitterCard: m('meta[name="twitter:card"]'),
    themeColor: m('meta[name="theme-color"]'),
    favicon: !!document.querySelector('link[rel~="icon"]'),
    h1Count: document.querySelectorAll('h1').length,
    headingSkips,
    hreflang: document.querySelectorAll('link[hreflang]').length,
    jsonLd: [...new Set(jsonLd)],
    wordCount: body.split(/\s+/).filter(Boolean).length,
  };

  // ---------- readable text outline (document order) ----------
  const out = [];
  let outLen = 0;
  let prev = '';
  for (const el of document.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,summary')) {
    if (el.closest('nav,script,style,noscript')) continue;
    if (!vis(el)) continue;
    const t = text(el);
    if (!t || t === prev || t.length < 2) continue;
    prev = t;
    const line = /^H[1-6]$/.test(el.tagName) ? '#'.repeat(Number(el.tagName[1])) + ' ' + t : el.tagName === 'LI' ? '- ' + t : el.tagName === 'BLOCKQUOTE' ? '> ' + t : t;
    out.push(line.slice(0, 400));
    outLen += line.length;
    if (outLen > 12000) break;
  }

  const bodySizes = top(sizes, 1)[0]?.[0] || null;
  const lh = lineHeights.length ? Math.round((lineHeights.reduce((a, b) => a + b, 0) / lineHeights.length) * 100) / 100 : null;
  const fonts = {
    families: top(families, 4).map(([name, chars]) => ({ name, chars })),
    sizesByUse: top(sizes, 6).map(([px, chars]) => ({ px, chars })),
    bodySize: bodySizes,
    h1Size: h1El ? Math.round(parseFloat(getComputedStyle(h1El).fontSize)) : null,
    weights: top(weights, 4).map(([w]) => w),
    lineHeight: lh,
    loadedWebFonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 6),
  };

  return {
    viewport: { w: vw, h: vh },
    pageHeight: pageH,
    sectionCount,
    seo,
    headings,
    h1: h1El ? text(h1El).slice(0, 160) : null,
    heroSub,
    ctas,
    navLinks,
    fonts,
    colors: {
      pageBg: hex(pageBg),
      accent,
      textColors: top(textColors, 5).map(([c]) => c),
      backgrounds: top(bgAreas, 6).map(([c]) => c),
      cssVars,
    },
    layout: {
      contentMaxWidth: top(widths, 1)[0]?.[0] || null,
      radii: top(radii, 3).map(([r]) => r),
      shadowedElements: shadows,
      cardLikeElements: cards,
    },
    images,
    forms,
    links,
    trust,
    a11y,
    text: out.join('\n'),
  };
}

export function extractMobile() {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const text = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

  const tapTargets = [...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"]')].filter(vis);
  const small = [];
  let under44 = 0;
  let under24 = 0;
  for (const el of tapTargets) {
    const r = el.getBoundingClientRect();
    const mn = Math.min(r.width, r.height);
    if (mn < 44) under44++;
    if (mn < 24) {
      under24++;
      if (small.length < 5) small.push({ label: (text(el) || el.getAttribute('aria-label') || el.tagName).slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  let tinyText = 0;
  for (const el of document.body.querySelectorAll('p,span,a,li,button,label,td')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!vis(el)) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 12) tinyText++;
  }
  const overflowing = [...document.body.querySelectorAll('*')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 2;
  }).length;
  const h1 = [...document.querySelectorAll('h1')].find(vis);
  const h1Rect = h1 ? h1.getBoundingClientRect() : null;
  const ctaAtf = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')]
    .filter((el) => vis(el) && el.getBoundingClientRect().top < vh && el.getBoundingClientRect().bottom > 0)
    .filter((el) => {
      const s = getComputedStyle(el);
      const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
      return /btn|button|cta/i.test(typeof el.className === 'string' ? el.className : '') || (filled && el.getBoundingClientRect().height >= 36);
    })
    .map((el) => text(el).slice(0, 40))
    .filter(Boolean);
  const fixedBars = [...document.body.querySelectorAll('*')]
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'sticky') return false;
      const r = el.getBoundingClientRect();
      return r.width >= vw * 0.8 && r.height > 20 && r.height < vh * 0.5 && vis(el);
    })
    .map((el) => Math.round(el.getBoundingClientRect().height));
  const hamburger = !!document.querySelector('[aria-label*="menu" i],[class*="burger" i],[class*="hamburger" i],button[aria-controls*="menu" i],[class*="menu-toggle" i],[class*="mobile-menu" i]');

  return {
    viewport: { w: vw, h: vh },
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
    horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    scrollWidth: document.documentElement.scrollWidth,
    overflowingElements: overflowing,
    tapTargets: { total: tapTargets.length, under44, under24, smallest: small },
    tinyTextElements: tinyText,
    h1VisibleAboveFold: !!h1Rect && h1Rect.top < vh,
    h1FontSize: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : null,
    ctasAboveFold: [...new Set(ctaAtf)].slice(0, 6),
    stickyBars: fixedBars,
    hamburgerMenu: hamburger,
    pageHeight: document.documentElement.scrollHeight,
  };
}
