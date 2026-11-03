"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Share2, Check } from "lucide-react";
import { HighlightText } from "./HighlightText";
import { MemeCard, LangPicker } from "./MemeCard";
import type { DimensionResult, Finding, Severity } from "./types";
import { LANG_STORAGE_KEY, isLangPref, planMemes, resolveLang, type LangPref } from "@/lib/memes";

const ACCENT = "#E8334A";
const MONO = "'Courier New','Lucida Console',monospace";

const BITS: Record<string, { title: string; emoji: string }> = {
  visual_design:     { title: "THE LOOKS",           emoji: "👁" },
  copywriting:       { title: "THE WORDS",           emoji: "✍️" },
  cta:               { title: "THE BUTTON",          emoji: "🎯" },
  ux_flow:           { title: "THE MAZE",            emoji: "🌀" },
  accessibility:     { title: "THE SQUINT TEST",     emoji: "♿" },
  trust_signals:     { title: "THE TRUST ISSUES",    emoji: "🔒" },
  mobile_experience: { title: "THE POCKET PROBLEM",  emoji: "📱" },
  performance:       { title: "THE WAIT",            emoji: "⚡" },
  seo:               { title: "THE GHOSTING",        emoji: "🔍" },
};

const SEV: Record<Severity, { color: string; tag: string }> = {
  critical: { color: "#FF2D55", tag: "💀 RIP" },
  high:     { color: "#FF9F0A", tag: "🔥 CAUGHT" },
  medium:   { color: "#FFD60A", tag: "😬 FUMBLE" },
  good:     { color: "#32D74B", tag: "✅ CREDIT WHERE DUE" },
};

function verdictFor(s: number) {
  if (s >= 75) return { verdict: "actually fire 🔥",        color: "#32D74B", vibe: "understood the assignment" };
  if (s >= 60) return { verdict: "mid but has potential",    color: "#FFD60A", vibe: "participation trophy behavior" };
  if (s >= 40) return { verdict: "bestie what is this 💀",  color: "#FF9F0A", vibe: "deployed and prayed" };
  if (s >= 20) return { verdict: "it's giving disaster 🚨",  color: "#FF6B00", vibe: "I am in physical pain" };
  return              { verdict: "call 911 immediately ☠️",  color: "#FF2D55", vibe: "sent it without looking" };
}

const scoreColor = (s: number) => (s >= 65 ? "#32D74B" : s >= 40 ? "#FFD60A" : "#FF2D55");

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "your site";
  }
}

/* ─── building blocks ───────────────────────────────────────────────────── */

function Avatar() {
  return (
    <div aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
      background: "linear-gradient(135deg,#E8334A,#FF6B3D)", boxShadow: "0 4px 14px rgba(232,51,74,0.35)" }}>🎤</div>
  );
}

function RoasterBubble({ children, accent = ACCENT, delay = 0 }: { children: React.ReactNode; accent?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }}
      style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 10px" }}>
      <Avatar />
      <div style={{ flex: 1, minWidth: 0, background: "#14141B", border: `1px solid ${accent}38`, borderRadius: "4px 18px 18px 18px", padding: "12px 14px", fontSize: 15, lineHeight: 1.55, color: "#EDEDF4" }}>
        {children}
      </div>
    </motion.div>
  );
}

function SiteBubble({ domain, quote, delay = 0 }: { domain: string; quote: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }}
      style={{ margin: "0 0 10px", marginLeft: "auto", maxWidth: "88%" }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: "#5A5A70", textAlign: "right", margin: "0 6px 4px", letterSpacing: "0.08em" }}>{domain} literally said:</div>
      <div style={{ border: "1px dashed #34344A", borderRadius: "18px 4px 18px 18px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5, color: "#A9A9C0", fontStyle: "italic" }}>
        &ldquo;{quote}&rdquo;
      </div>
    </motion.div>
  );
}

function FixToggle({ action, color }: { action: string; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: "-2px 0 16px 44px" }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ cursor: "pointer", background: "transparent", border: `1px solid ${color}44`, color: "#B8B8CC", borderRadius: 99, padding: "6px 12px", minHeight: 32, fontSize: 12, fontWeight: 700 }}>
        {open ? "🙈 hide the cure" : "💊 how to stop the pain"}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, background: `${color}10`, borderLeft: `3px solid ${color}`, fontSize: 14, lineHeight: 1.55, color: "#D6D6E4" }}>{action}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Exchange({ f, domain, delay }: { f: Finding; domain: string; delay: number }) {
  const sev = SEV[f.severity] ?? SEV.medium;
  return (
    <div>
      {f.quote && <SiteBubble domain={domain} quote={f.quote} delay={delay} />}
      <RoasterBubble accent={sev.color} delay={delay + 0.08}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: sev.color, marginBottom: 6 }}>{sev.tag}</div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.01em", color: "#FAFAFA" }}>
          <HighlightText text={f.title} accentColor={sev.color} />
        </div>
      </RoasterBubble>
      <FixToggle action={f.action} color={sev.color} />
    </div>
  );
}

function Flames({ score }: { score: number }) {
  const lit = Math.max(0, Math.min(5, Math.round((100 - score) / 20)));
  return (
    <span title={`burn level ${lit}/5`} aria-label={`burn level ${lit} of 5`} style={{ display: "inline-flex", gap: 1, fontSize: 13, flexShrink: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ opacity: i < lit ? 1 : 0.15, filter: i < lit ? "none" : "grayscale(1)" }}>🔥</span>)}
    </span>
  );
}

function Typing({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "24px 0 6px" }}>
      <Avatar />
      <div style={{ background: "#14141B", border: `1px solid ${ACCENT}38`, borderRadius: "4px 18px 18px 18px", padding: "12px 16px", display: "flex", gap: 5, alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "block" }} />
        ))}
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#5A5A70", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{text}</span>
    </div>
  );
}

/* ─── a single bit ──────────────────────────────────────────────────────── */

function Bit({ d, n, domain, meme }: { d: DimensionResult; n: number; domain: string; meme: React.ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const bit = BITS[d.dimension] ?? { title: d.dimension.replace(/_/g, " ").toUpperCase(), emoji: "🔥" };
  const shown = showAll ? d.findings : d.findings.slice(0, 2);
  const hidden = d.findings.length - shown.length;
  return (
    <section aria-label={bit.title} style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "34px 0 14px" }}>
        <span style={{ fontSize: 22 }}>{bit.emoji}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "#5A5A70", letterSpacing: "0.22em" }}>BIT {String(n).padStart(2, "0")}</div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", color: "#FAFAFA" }}>{bit.title}</div>
        </div>
        <div style={{ flex: 1, height: 1, background: "#1E1E28" }} />
        <Flames score={d.score} />
      </div>

      {d.failed ? (
        <RoasterBubble accent="#5A5A70"><span style={{ color: "#8B8BA3" }}>I lost my train of thought on this one. Re-run the roast and I&apos;ll come back angrier.</span></RoasterBubble>
      ) : (
        <>
          <RoasterBubble>{d.summary}</RoasterBubble>
          {shown.map((f, i) => <Exchange key={`${d.dimension}-${i}`} f={f} domain={domain} delay={0.1 + i * 0.12} />)}
          {hidden > 0 && (
            <button onClick={() => setShowAll(true)}
              style={{ cursor: "pointer", margin: "0 0 12px 44px", background: "transparent", border: "none", color: ACCENT, fontSize: 13, fontWeight: 800, padding: "6px 0", minHeight: 32 }}>
              +{hidden} more {hidden === 1 ? "burn" : "burns"} →
            </button>
          )}
        </>
      )}
      {meme}
    </section>
  );
}

/* ─── the show ──────────────────────────────────────────────────────────── */

interface Props {
  siteUrl: string;
  isUpload?: boolean;
  shots: string[];
  dims: DimensionResult[];
  done: boolean;
  score: number | null;
  totalBits: number;
  status: string;
  taunt: string;
}

export function RoastShow({ siteUrl, isUpload, shots, dims, done, score, totalBits, status, taunt }: Props) {
  const domain = isUpload ? "your screenshot" : domainOf(siteUrl);
  const [langPref, setLangPref] = useState<LangPref>("auto");
  const [browserLangs, setBrowserLangs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const usedRef = useRef<Set<string>>(new Set());
  const [sessionSeed] = useState(() => `${siteUrl}:${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (isLangPref(saved)) setLangPref(saved);
    } catch { /* storage unavailable */ }
    setBrowserLangs([...(navigator.languages ?? [navigator.language])]);
  }, []);

  function changeLang(v: LangPref) {
    setLangPref(v);
    usedRef.current = new Set();
    try { localStorage.setItem(LANG_STORAGE_KEY, v); } catch { /* ignore */ }
  }

  const plan = useMemo(
    () => planMemes(dims.filter((d) => !d.failed).map((d) => ({ dimension: d.dimension, score: d.score })), done ? score : null, sessionSeed),
    [dims, done, score, sessionSeed],
  );

  const sorted = [...dims].filter((d) => !d.failed).sort((a, b) => a.score - b.score);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const rehab = sorted
    .filter((d) => d.score < 65)
    .slice(0, 3)
    .map((d) => ({ d, f: d.findings.find((f) => f.severity !== "good") ?? d.findings[0] }))
    .filter((x) => x.f);

  const verdict = score !== null ? verdictFor(score) : null;
  const first = shots[0];
  const openerLine = done ? "Take a seat. This took a while." : dims.length > 0 ? "Okay. I've seen enough. Let's begin." : shots.length > 0 ? status : "Pulling the site up. Hold my coffee.";

  async function share() {
    if (score === null) return;
    const text = `${domain} just got ${score}/100 on RoastLab 💀`;
    const href = typeof location !== "undefined" ? location.href : "";
    try {
      if (navigator.share) { await navigator.share({ title: "RoastLab", text, url: href }); return; }
      await navigator.clipboard.writeText(`${text} ${href}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* user dismissed the share sheet */ }
  }

  const memeFor = (placement: ReturnType<typeof planMemes>["hero"], label: string) => {
    if (!placement) return null;
    const lang = resolveLang(langPref, browserLangs, placement.seedKey);
    return <MemeCard key={`${placement.seedKey}:${lang}`} placement={placement} lang={lang} usedRef={usedRef} label={label} />;
  };

  return (
    <div style={{ overflowX: "clip" }}>
      {/* ── cold open ── */}
      <section style={{ position: "relative", textAlign: "center", padding: "6px 0 18px" }}>
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: -60, height: 360, background: "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(232,51,74,0.30), transparent)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.28em", color: ACCENT, fontWeight: 900 }}>🎤 TONIGHT&apos;S VICTIM</div>
          <h1 style={{ margin: "10px 0 18px", fontSize: "clamp(30px, 9vw, 52px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05, color: "#FAFAFA", wordBreak: "break-word" }}>{domain}</h1>

          {first && (
            <motion.div initial={{ opacity: 0, y: 12, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -1.2 }} transition={{ duration: 0.5 }}
              style={{ position: "relative", margin: "0 auto", width: "min(100%, 430px)", padding: 6, background: "#fff", borderRadius: 10, boxShadow: "0 18px 50px rgba(0,0,0,0.6)" }}>
              <div style={{ maxHeight: 250, overflow: "hidden", borderRadius: 6, background: "#222" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={first} alt={`${domain} homepage`} style={{ width: "100%", display: "block" }} />
              </div>
              <motion.div initial={{ opacity: 0, scale: 2, rotate: -20 }} animate={{ opacity: 1, scale: 1, rotate: -9 }} transition={{ delay: 0.5, duration: 0.3 }}
                style={{ position: "absolute", right: -8, bottom: 18, padding: "3px 12px", border: `3px solid ${ACCENT}`, color: ACCENT, fontSize: 15, fontWeight: 900, letterSpacing: "0.12em", background: "rgba(255,255,255,0.92)", borderRadius: 4 }}>
                ROASTED
              </motion.div>
            </motion.div>
          )}

          {shots.length > 1 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", justifyContent: shots.length > 4 ? "flex-start" : "center", padding: "14px 2px 2px", WebkitOverflowScrolling: "touch" }}>
              {shots.slice(1, 9).map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s} src={s} alt={`section ${i + 2} of ${domain}`} style={{ height: 54, width: 86, objectFit: "cover", objectPosition: "top", borderRadius: 6, border: "1px solid #25252F", flexShrink: 0, opacity: 0.85 }} />
              ))}
            </div>
          )}

          <p style={{ margin: "18px 0 0", fontSize: 15, fontStyle: "italic", color: "#8B8BA3" }}>{openerLine}</p>
          {dims.length > 0 && <div style={{ marginTop: 14 }}><LangPicker value={langPref} onChange={changeLang} /></div>}
        </div>
      </section>

      {/* ── the set ── */}
      {dims.map((d, i) => (
        <Bit key={d.dimension} d={d} n={i + 1} domain={domain}
          meme={done ? memeFor(plan.byDimension[d.dimension] ?? null, plan.byDimension[d.dimension]?.mood === "hype" ? "THE CROWD GOES WILD" : "THE CROWD REACTS") : null} />
      ))}

      {!done && <Typing text={dims.length === 0 ? status : `${taunt} · ${dims.length}/${totalBits} bits`} />}

      {/* ── closer ── */}
      {done && score !== null && verdict && (
        <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
          style={{ margin: "44px 0 8px", padding: "28px 18px 24px", textAlign: "center", borderRadius: 26, border: `1px solid ${verdict.color}55`, background: `radial-gradient(ellipse at 50% 0%, ${verdict.color}26, #101016 70%)` }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.3em", color: verdict.color, fontWeight: 900 }}>THE VERDICT</div>
          <div style={{ margin: "6px 0 2px", fontSize: "clamp(76px, 24vw, 120px)", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.06em", color: verdict.color }}>
            {score}<span style={{ fontSize: "0.28em", letterSpacing: 0, color: "#5A5A70", fontWeight: 800 }}>/100</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", color: "#FAFAFA" }}>{verdict.verdict}</div>
          <div style={{ margin: "4px 0 18px", fontSize: 14, fontStyle: "italic", color: "#8B8BA3" }}>&ldquo;{verdict.vibe}&rdquo;</div>

          <div style={{ position: "relative", height: 8, margin: "0 6px", borderRadius: 99, background: "linear-gradient(90deg,#FF2D55,#FF9F0A,#FFD60A,#32D74B)" }}>
            <motion.div initial={{ left: "0%" }} animate={{ left: `${Math.max(2, Math.min(98, score))}%` }} transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: "absolute", top: -5, width: 18, height: 18, marginLeft: -9, borderRadius: "50%", background: "#fff", border: "3px solid #09090B", boxShadow: "0 2px 10px rgba(0,0,0,0.6)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", margin: "8px 6px 0", fontFamily: MONO, fontSize: 10, color: "#5A5A70" }}><span>☠️ COOKED</span><span>🔥 ACTUALLY FIRE</span></div>

          {memeFor(plan.hero, "THE ROOM REACTS")}

          {worst && best && worst.dimension !== best.dimension && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", margin: "20px 0 4px" }}>
              <span style={{ padding: "8px 12px", borderRadius: 99, background: "#FF2D5518", border: "1px solid #FF2D5544", fontSize: 13, fontWeight: 700 }}>
                💀 Biggest L: {BITS[worst.dimension]?.title ?? worst.dimension} <b style={{ color: scoreColor(worst.score) }}>{worst.score}</b>
              </span>
              {best.score >= 40 && (
                <span style={{ padding: "8px 12px", borderRadius: 99, background: "#32D74B14", border: "1px solid #32D74B44", fontSize: 13, fontWeight: 700 }}>
                  🏆 Biggest W: {BITS[best.dimension]?.title ?? best.dimension} <b style={{ color: scoreColor(best.score) }}>{best.score}</b>
                </span>
              )}
            </div>
          )}

          {rehab.length > 0 && (
            <div style={{ margin: "22px 0 4px", padding: "16px 16px 6px", textAlign: "left", borderRadius: 18, background: "#0C0C11", border: "1px solid #1E1E28" }}>
              <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12, color: "#FAFAFA" }}>🩹 Want the roasting to stop? Fix these first.</div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {rehab.map(({ d, f }, i) => (
                  <li key={d.dimension} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                    <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: "50%", background: ACCENT, color: "#fff", fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: "#5A5A70", letterSpacing: "0.14em", marginBottom: 3 }}>{BITS[d.dimension]?.title ?? d.dimension}</div>
                      <div style={{ fontSize: 14, lineHeight: 1.5, color: "#D6D6E4" }}>{f!.action}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <button onClick={share}
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 18, minHeight: 48, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#E8334A,#FF6B3D)", color: "#fff", fontSize: 15, fontWeight: 800 }}>
            {copied ? <Check size={16} /> : <Share2 size={16} />}{copied ? "Copied. Go ruin their day." : "Share this roast"}
          </button>
        </motion.section>
      )}
    </div>
  );
}
