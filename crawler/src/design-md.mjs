const q = (s) => (s == null || s === '' ? '—' : String(s));
const quote = (s) => `"${String(s).replace(/"/g, "'")}"`;
const list = (arr) => (arr && arr.length ? arr.join(', ') : '—');

/**
 * Builds a factual DESIGN.md from crawl data. Facts only, no opinions: the roast model
 * uses it as evidence and must quote it rather than guess from a screenshot.
 */
export function buildDesignMd({ url, finalUrl, status, facts: f, mobile: m, perf, subpages }) {
  const host = (() => {
    try {
      return new URL(finalUrl || url).hostname;
    } catch {
      return url;
    }
  })();
  const L = [];
  const push = (...lines) => L.push(...lines);

  push(`# DESIGN.md — ${host}`, '', `Source: ${finalUrl || url} (HTTP ${q(status)}). Measured from the rendered page at 1280px desktop and 390px mobile.`, '');

  push('## Overview');
  push(`- Title: ${q(f.seo.title)}`, `- Meta description: ${q(f.seo.description)}`);
  push(`- Primary headline (H1): ${f.h1 ? quote(f.h1) : 'NONE FOUND'}`, `- Sub-headline: ${f.heroSub ? quote(f.heroSub) : '—'}`);
  push(`- Page height: ${f.pageHeight}px across ${f.sectionCount} <section> elements, ~${f.seo.wordCount} words`, '');

  push('## Theme');
  push(`- Page background: ${q(f.colors.pageBg)}`, `- Accent color (most-used CTA/link color): ${q(f.colors.accent)}`);
  push(`- Dominant backgrounds (by area): ${list(f.colors.backgrounds)}`, `- Text colors (by usage): ${list(f.colors.textColors)}`);
  if (f.colors.cssVars.length) push(`- CSS custom properties: ${f.colors.cssVars.slice(0, 16).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  push(`- theme-color meta: ${q(f.seo.themeColor)}`, '');

  push('## Typography');
  push(`- Font families (by text volume): ${list(f.fonts.families.map((x) => x.name))}`, `- Web fonts loaded: ${list(f.fonts.loadedWebFonts)}`);
  push(`- Body size: ${q(f.fonts.bodySize)}px, H1 size: ${q(f.fonts.h1Size)}px, line-height: ${q(f.fonts.lineHeight)}`, `- Font sizes in use (px, by text volume): ${list(f.fonts.sizesByUse.map((x) => x.px))}`, `- Font weights: ${list(f.fonts.weights)}`, '');

  push('## Layout & shape');
  push(`- Content max-width (most common wide container): ${q(f.layout.contentMaxWidth)}px`, `- Border radii on cards/buttons: ${list(f.layout.radii)}`);
  push(`- Card-like elements: ${f.layout.cardLikeElements}; elements with box-shadow: ${f.layout.shadowedElements}`, '');

  push('## Navigation');
  push(f.navLinks.length ? f.navLinks.map((n) => `- ${n.text} → ${n.href}`).join('\n') : '- No header/nav links detected', '');

  push('## Calls to action');
  if (f.ctas.length) {
    push('| Label | Above fold | In nav | Background | Text | Size | Contrast | Generic label |', '|---|---|---|---|---|---|---|---|');
    for (const c of [...f.ctas].sort((a, b) => Number(b.aboveFold) - Number(a.aboveFold)).slice(0, 14)) {
      push(`| ${quote(c.label)} | ${c.aboveFold ? 'yes' : 'no'} | ${c.inNav ? 'yes' : 'no'} | ${q(c.bg)} | ${q(c.fg)} | ${c.w}x${c.h} ${c.fontSize}px | ${q(c.contrast)} | ${c.generic ? 'YES' : 'no'} |`);
    }
  } else {
    push('- No button-like CTAs detected');
  }
  const above = f.ctas.filter((c) => c.aboveFold);
  push(`- CTAs above the fold: ${above.length}${above.length ? ' — ' + above.map((c) => quote(c.label) + (c.inNav ? ' (header)' : '')).join(', ') : ''}`, '');

  push('## Content outline');
  push(f.headings.length ? f.headings.map((h) => `${'  '.repeat(h.level - 1)}- H${h.level} (${h.size}px): ${quote(h.text)}`).join('\n') : '- No headings found');
  push(`- H1 count: ${f.seo.h1Count}; heading-level skips: ${f.seo.headingSkips}`, '');

  push('## Trust signals');
  const t = f.trust;
  push(`- Testimonials/customer stories: ${q(t.testimonials)}`, `- "Trusted by"/social proof: ${q(t.trustedBy)}`, `- Ratings/review sites: ${q(t.ratings)}`);
  push(`- Numeric proof points: ${list(t.numbers)}`, `- Guarantee/risk-reversal language: ${q(t.guarantee)}`, `- Security/compliance mentions: ${q(t.security)}`);
  push(`- Logo-like images: ${t.logoImages}; pricing shown: ${t.pricing ? 'yes' : 'no'}; FAQ: ${t.faq ? 'yes' : 'no'}; chat widget: ${t.chatWidget ? 'yes' : 'no'}`);
  push(`- Privacy link: ${f.links.privacy ? 'yes' : 'no'}; Terms link: ${f.links.terms ? 'yes' : 'no'}; Contact: ${f.links.contact ? 'yes' : 'no'}; Social: ${list(f.links.social)}`, '');

  push('## Accessibility (measured)');
  const a = f.a11y;
  push(`- html lang: ${q(a.lang)}; landmarks present (header/nav/main/footer): ${a.landmarks}/4; skip link: ${a.skipLink ? 'yes' : 'no'}`);
  push(`- Text contrast: ${a.contrastFailCount} of ${a.contrastChecked} sampled text elements fail WCAG AA (${a.contrastUnknown} over images/gradients not measurable)`);
  for (const w of a.contrastWorst) push(`  - ${quote(w.text)} ${w.fg} on ${w.bg} = ${w.ratio}:1 at ${w.size}px`);
  push(`- Buttons/links with no accessible name: ${a.unnamedInteractive}`);
  push(`- Images: ${f.images.total} visible, ${f.images.missingAlt} missing alt, ${f.images.emptyAlt} empty alt; forms: ${f.forms.count} with ${f.forms.inputs} inputs, ${f.forms.placeholderOnly} without a real label`, '');

  push('## Mobile (390px viewport)');
  if (m) {
    push(`- viewport meta: ${q(m.viewportMeta)}; horizontal overflow: ${m.horizontalOverflow ? `YES (scrollWidth ${m.scrollWidth}px, ${m.overflowingElements} elements)` : 'no'}`);
    push(`- Tap targets: ${m.tapTargets.total} total, ${m.tapTargets.under44} under 44px, ${m.tapTargets.under24} under 24px${m.tapTargets.smallest.length ? ' (e.g. ' + m.tapTargets.smallest.map((s) => `${quote(s.label)} ${s.w}x${s.h}`).join(', ') + ')' : ''}`);
    push(`- Text under 12px: ${m.tinyTextElements} elements; H1 above the fold: ${m.h1VisibleAboveFold ? 'yes' : 'no'} (${q(m.h1FontSize)}px)`);
    push(`- CTAs above the fold: ${m.ctasAboveFold.length ? m.ctasAboveFold.map(quote).join(', ') : 'none'}; sticky/fixed bars: ${list(m.stickyBars.map((h) => h + 'px'))}; hamburger menu: ${m.hamburgerMenu ? 'yes' : 'no'}`, '');
  } else {
    push('- Mobile pass did not complete', '');
  }

  push('## Performance (measured in a cold headless load)');
  if (perf) {
    push(`- TTFB ${q(perf.ttfb)}ms, DOMContentLoaded ${q(perf.domContentLoaded)}ms, load ${q(perf.load)}ms, LCP ${q(perf.lcp)}ms, CLS ${q(perf.cls)}`);
    push(`- ${perf.requests} requests (${perf.thirdPartyRequests} third-party), ~${perf.kb.total}KB transferred: JS ${perf.kb.script}KB, CSS ${perf.kb.stylesheet}KB, images ${perf.kb.image}KB, fonts ${perf.kb.font}KB; failed requests: ${perf.failed}`, '');
  } else {
    push('- Not measured', '');
  }

  push('## SEO');
  const s = f.seo;
  push(`- Title length ${s.titleLen}, description length ${s.descriptionLen}, canonical: ${q(s.canonical)}, robots: ${q(s.robots)}`);
  push(`- og:title: ${q(s.ogTitle)}, og:image: ${s.ogImage ? 'yes' : 'no'}, twitter:card: ${q(s.twitterCard)}, favicon: ${s.favicon ? 'yes' : 'no'}, JSON-LD: ${list(s.jsonLd)}`, '');

  if (subpages && subpages.length) {
    push('## Other pages crawled');
    for (const p of subpages) push(`### ${p.path} — ${q(p.title)}`, p.headings.map((h) => `- ${quote(h)}`).join('\n'), '', p.text, '');
  }

  push('## Verbatim text (quote this exactly)', '```', f.text.slice(0, 6500), '```');
  return L.join('\n');
}
