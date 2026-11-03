"use client";

import { hashStr } from "@/lib/memes";

/* ─── Emphasis renderer — **bold** highlighted, ~~strike~~ crossed-out ──────
   Rotates through several distinct visual treatments per word (chip, marker
   underline, glow, box) so repeated highlights don't all look identical. */
export function HighlightText({ text, accentColor = "#E8334A" }: { text: string; accentColor?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|~~[^~]+~~)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const word = part.slice(2, -2);
          const style = hashStr(word) % 4;
          if (style === 0) return (
            <span key={i} style={{ background: `${accentColor}22`, color: accentColor, fontWeight: 900, padding: "1px 5px", borderRadius: 4, fontSize: "0.95em", border: `1px solid ${accentColor}55`, whiteSpace: "nowrap" }}>{word}</span>
          );
          if (style === 1) return (
            <span key={i} style={{ color: accentColor, fontWeight: 900, textDecoration: `underline wavy ${accentColor}`, textDecorationThickness: 2, textUnderlineOffset: 3 }}>{word}</span>
          );
          if (style === 2) return (
            <span key={i} style={{ color: "#fff", fontWeight: 900, textShadow: `0 0 8px ${accentColor}, 0 0 2px ${accentColor}` }}>{word}</span>
          );
          return (
            <span key={i} style={{ background: accentColor, color: "#000", fontWeight: 900, padding: "0 4px", boxShadow: `2px 2px 0 ${accentColor}66`, display: "inline-block", transform: "rotate(-1deg)" }}>{word}</span>
          );
        }
        if (part.startsWith("~~") && part.endsWith("~~")) {
          const word = part.slice(2, -2);
          const style = hashStr(word) % 2;
          if (style === 0) return (
            <span key={i} style={{ textDecoration: "line-through", opacity: 0.55, fontStyle: "italic" }}>{word}</span>
          );
          return (
            <span key={i} style={{ textDecoration: "line-through", textDecorationColor: "#FF2D55", textDecorationThickness: 2, opacity: 0.7 }}>{word}</span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
