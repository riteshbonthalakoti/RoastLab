"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  buildCaptionMeme, buildGiphyQuery, LANG_PREFS,
  type CaptionMemeSpec, type LangPref, type MemeLang, type MemePlacement,
} from "@/lib/memes";
import { hiFont, teFont } from "./fonts";

const OUTLINE = ["-2px -2px 0 #000", "2px -2px 0 #000", "-2px 2px 0 #000", "2px 2px 0 #000", "0 3px 0 #000", "0 -3px 0 #000", "3px 0 0 #000", "-3px 0 0 #000"].join(",");

/** Template image (memegen.link, no text) with captions drawn in the browser so Telugu/Hindi render. */
export function CaptionMeme({ spec }: { spec: CaptionMemeSpec }) {
  const family = spec.lang === "te" ? teFont.style.fontFamily : spec.lang === "hi" ? hiFont.style.fontFamily : "Impact, 'Arial Black', 'Helvetica Neue', sans-serif";
  const caption: React.CSSProperties = {
    position: "absolute", left: 10, right: 10, textAlign: "center", color: "#fff", fontFamily: family, fontWeight: 800,
    fontSize: spec.lang === "en" ? "clamp(16px, 5.4vw, 24px)" : "clamp(14px, 4.6vw, 20px)",
    lineHeight: spec.lang === "en" ? 1.12 : 1.3, textShadow: OUTLINE, textTransform: spec.lang === "en" ? "uppercase" : "none", wordBreak: "break-word",
  };
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", overflow: "hidden", borderRadius: 10, background: "#111" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://api.memegen.link/images/${spec.template}.jpg`} alt={`meme: ${spec.top} ${spec.bottom}`}
        style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "calc(100% + 28px)", objectFit: "cover", objectPosition: "top" }} />
      <div style={{ ...caption, top: 10 }}>{spec.top}</div>
      <div style={{ ...caption, bottom: 38 }}>{spec.bottom}</div>
    </div>
  );
}

interface GifState { phase: "loading" | "gif" | "caption"; url?: string; rawUrl?: string }

interface Props {
  placement: MemePlacement;
  lang: MemeLang;
  usedRef: React.MutableRefObject<Set<string>>;
  label: string;
  maxWidth?: number;
}

/** One meme slot: a finding-specific caption meme, or a language-matched reaction GIF that falls back to a caption meme. */
export function MemeCard({ placement, lang, usedRef, label, maxWidth = 300 }: Props) {
  const seed = `${placement.seedKey}:${lang}`;
  const spec = buildCaptionMeme({ lang, score: placement.score, dimension: placement.dimension, seed });
  const [gif, setGif] = useState<GifState>({ phase: placement.kind === "gif" ? "loading" : "caption" });
  const hype = placement.mood === "hype";

  useEffect(() => {
    if (placement.kind !== "gif") return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    setGif({ phase: "loading" });
    const q = buildGiphyQuery({ lang, mood: placement.mood, dimension: placement.dimension, seed });
    const params = new URLSearchParams({ q, lang, mood: placement.mood, seed, exclude: [...usedRef.current].join(",") });
    fetch(`/api/meme?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url: string | null; rawUrl?: string; id?: string } | null) => {
        if (d?.url) {
          if (d.id) usedRef.current.add(d.id);
          setGif({ phase: "gif", url: d.url, rawUrl: d.rawUrl });
        } else setGif({ phase: "caption" });
      })
      .catch(() => setGif({ phase: "caption" }))
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, placement.kind]);

  const tilt = (hype ? 1 : -1) * 1.2;
  const accent = hype ? "#32D74B" : "#E8334A";

  return (
    <motion.figure initial={{ opacity: 0, y: 14, rotate: tilt * 2 }} whileInView={{ opacity: 1, y: 0, rotate: tilt }} viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, ease: [0.34, 1.4, 0.64, 1] }}
      style={{ margin: "18px auto 6px", width: `min(100%, ${maxWidth}px)` }}>
      <div style={{ fontFamily: "'Courier New',monospace", fontSize: 10, letterSpacing: "0.2em", color: accent, textAlign: "center", marginBottom: 8 }}>{label}</div>
      <div style={{ padding: 6, background: "#fff", borderRadius: 12, boxShadow: `0 10px 34px ${accent}33, 0 2px 8px rgba(0,0,0,0.5)` }}>
        {gif.phase === "loading" && (
          <motion.div animate={{ opacity: [0.35, 0.7, 0.35] }} transition={{ duration: 1.2, repeat: Infinity }}
            style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 8, background: "#d9d9de" }} />
        )}
        {gif.phase === "gif" && gif.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gif.url} alt="meme reaction" loading="lazy" style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, minHeight: 120 }}
            onError={() => setGif((g) => (g.rawUrl && g.url !== g.rawUrl ? { ...g, url: g.rawUrl } : { phase: "caption" }))} />
        )}
        {gif.phase === "caption" && <CaptionMeme spec={spec} />}
      </div>
    </motion.figure>
  );
}

export function LangPicker({ value, onChange }: { value: LangPref; onChange: (v: LangPref) => void }) {
  return (
    <div role="group" aria-label="Meme language" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 3, borderRadius: 99, background: "#111117", border: "1px solid #1E1E28" }}>
      <span style={{ fontSize: 10, color: "#5A5A70", padding: "0 6px 0 8px", letterSpacing: "0.1em" }}>MEMES</span>
      {LANG_PREFS.map((l) => {
        const on = l.value === value;
        return (
          <button key={l.value} onClick={() => onChange(l.value)} aria-pressed={on}
            style={{ border: "none", cursor: "pointer", padding: "5px 9px", minHeight: 28, borderRadius: 99, fontSize: 11, fontWeight: 800, background: on ? "#E8334A" : "transparent", color: on ? "#fff" : "#8B8BA3" }}>
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
