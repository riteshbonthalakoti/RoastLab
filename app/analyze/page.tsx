"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, Lock, CreditCard, Loader2, Flame, Download } from "lucide-react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";

const ADMIN_EMAILS = ['bonthalamadhavi1@gmail.com', 'ritesh@gratiantechnologies.com'];

import type { DimensionResult } from "@/components/roast/types";
import { RoastShow } from "@/components/roast/RoastShow";

const LOCKED_DIMS = [
  { key: "ux_flow",          label: "UX Flow",       emoji: "🌀" },
  { key: "accessibility",    label: "Accessibility", emoji: "♿" },
  { key: "trust_signals",    label: "Trust Signals", emoji: "🔒" },
  { key: "mobile_experience",label: "Mobile",        emoji: "📱" },
  { key: "performance",      label: "Performance",   emoji: "⚡" },
  { key: "seo",              label: "SEO",           emoji: "🔍" },
];

const TAUNTS = [
  "🧠 analyzing every pixel with judgment…",
  "😤 compiling the receipts…",
  "☕ brewing maximum shade…",
  "🎯 catching every fumble…",
  "💅 writing things that will sting…",
  "🔬 finding crimes you thought were hidden…",
  "⚠️ this is going to be a lot…",
];

/* ─── Locked ─────────────────────────────────────────────────────────────── */
function Locked({ label, emoji }: { label: string; emoji: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.06)", marginBottom: 6 }}>
      <span style={{ opacity: 0.2, fontSize: 14 }}>{emoji}</span>
      <span style={{ fontSize: 12, color: "#2E2E4E", fontWeight: 500 }}>{label}</span>
      <Lock size={10} style={{ color: "#2E2E4E", marginLeft: "auto" }}/>
    </div>
  );
}

/* ─── Upsell ─────────────────────────────────────────────────────────────── */
function Upsell({ siteUrl }: { siteUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function pay() {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/stripe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteUrl }) });
      const d = await r.json() as { url?: string; error?: string };
      if (d.url) window.location.href = d.url;
      else { setErr(d.error ?? "failed"); setLoading(false); }
    } catch (e) { setErr(e instanceof Error ? e.message : "error"); setLoading(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.45 }}
      style={{ marginTop: 8, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,45,85,0.2)", background: "linear-gradient(160deg, #1C0810 0%, #120A1E 60%, #0C0C1A 100%)", position: "relative" }}
    >
      <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 280, height: 280, background: "radial-gradient(circle, rgba(255,45,85,0.07) 0%, transparent 65%)", pointerEvents: "none" }}/>
      <div style={{ padding: "28px 22px", textAlign: "center", position: "relative" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
        <h3 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: "#F0EFF8", letterSpacing: "-0.02em" }}>
          6 more roasts waiting to destroy you
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#4A4A6E", lineHeight: 1.6, maxWidth: 340, marginLeft: "auto", marginRight: "auto" }}>
          You survived the preview. The full roast is worse. UX, Accessibility, Trust, Mobile, Performance, SEO — all getting dragged.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginBottom: 22 }}>
          {LOCKED_DIMS.map(d => (
            <span key={d.key} style={{ padding: "3px 9px", borderRadius: 99, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 11.5, color: "#3A3A5E" }}>
              {d.emoji} {d.label}
            </span>
          ))}
        </div>
        <button onClick={pay} disabled={loading} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "13px 26px", borderRadius: 12,
          background: loading ? "#180608" : "linear-gradient(135deg, #FF2D55 0%, #FF6B3D 100%)",
          color: loading ? "#6E2030" : "#fff", border: "none", cursor: loading ? "default" : "pointer",
          fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em",
          boxShadow: loading ? "none" : "0 4px 24px rgba(255,45,85,0.35)", transition: "all 0.18s",
        }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
        >
          {loading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }}/> : <CreditCard size={15}/>}
          {loading ? "Going to Stripe…" : "Unlock Full Roast — ₹2,499"}
        </button>
        {err && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#FF2D55" }}>{err}</p>}
        <p style={{ margin: "12px 0 0", fontSize: 10, color: "#2E2E4E" }}>one-time · no subscription · stripe</p>
      </div>
    </motion.div>
  );
}

/* ─── Auth gate ─────────────────────────────────────────────────────────── */
function AuthGate({ onSignIn }: { onSignIn: () => void }) {
  const { openSignIn } = useClerk();
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}
        style={{ maxWidth: 400, width: "100%", borderRadius: 20, background: "#111117", border: "1px solid rgba(232,51,74,0.25)", padding: "36px 28px", textAlign: "center", position: "relative", overflow: "hidden" }}
      >
        <motion.div
          animate={{ x: ['-100%','100%'] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #E8334A, transparent)', pointerEvents: 'none' }}
        />
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔥</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900, color: "#FAFAFA", letterSpacing: "-0.02em" }}>
          Free audit used
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#8B8BA3", lineHeight: 1.6 }}>
          {"You've used your 1 free audit. Sign in to get 2 more free audits and keep roasting."}
        </p>
        <button
          onClick={() => { openSignIn(); onSignIn(); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "13px 28px", borderRadius: 12, border: "none",
            background: "#E8334A", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", letterSpacing: "-0.01em", width: "100%", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(232,51,74,0.3)",
          }}
        >
          Sign in to continue
        </button>
        <Link href="/" style={{ display: "block", marginTop: 16, fontSize: 12, color: "#4A4A62", textDecoration: "none" }}>
          ← back to home
        </Link>
      </motion.div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
function AnalyzeContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";
  const tier = (searchParams.get("tier") ?? "free") as "free" | "full";
  const paid = searchParams.get("paid") === "1";
  const upload = searchParams.get("upload") === "1";
  const cachedId = searchParams.get("id") ?? "";

  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const isAdmin = user?.emailAddresses.some(e => ADMIN_EMAILS.includes(e.emailAddress.toLowerCase())) ?? false;

  const [status, setStatus]   = useState("warming up the roast machine…");
  const [dims, setDims]       = useState<DimensionResult[]>([]);
  const [done, setDone]       = useState(false);
  const [score, setScore]     = useState<number | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [shots, setShots]     = useState<string[]>([]);
  const [cachedUrl, setCachedUrl] = useState("");
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [taunt, setTaunt]     = useState(0);
  const [gated, setGated]     = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [cachedTier, setCachedTier] = useState<"free" | "full" | null>(null);

  const effectiveTier = isAdmin ? 'full' : (cachedTier ?? tier);
  const started = useRef(false);

  // Load cached audit from DB when ?id= is present
  useEffect(() => {
    if (!cachedId || started.current) return;
    started.current = true;
    fetch(`/api/audit/${cachedId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { url: string; score: number; tier: string; dimensions: DimensionResult[] } | null) => {
        if (!data) { setError("Audit not found."); return; }
        setCachedUrl(data.url);
        setCachedTier((data.tier === 'full' ? 'full' : 'free') as "free" | "full");
        setDims(data.dimensions as DimensionResult[]);
        setScore(data.score);
        setDone(true);
      })
      .catch(() => setError("Failed to load cached audit."));
  }, [cachedId]);

  useEffect(() => {
    if (!isLoaded) return;
    if (started.current) return;
    if (!upload && !url) return;
    if (cachedId) return; // handled by cachedId useEffect
    // Wait for Clerk auth to finish loading before starting
    if (!isLoaded) return;
    if (started.current) return;

    // Session gate: 1 free audit per session without sign-in (URL audits only)
    if (!upload && !isSignedIn && !paid) {
      const count = parseInt(localStorage.getItem("roastlab_audit_count") ?? "0");
      if (count >= 1) {
        setGated(true);
        return;
      }
    }

    started.current = true;

    const form = new FormData();
    form.append("tier", effectiveTier);
    if (paid || isAdmin) form.append("paid", "1");

    if (upload) {
      try {
        const raw = sessionStorage.getItem("roastlab_upload");
        if (!raw) { setError("No screenshot found. Please upload again."); started.current = false; return; }
        const { base64, mimeType, name } = JSON.parse(raw) as { base64: string; mimeType: string; name: string };
        // Don't remove from sessionStorage until fetch actually starts
        form.append("imageBase64", base64);
        form.append("imageMimeType", mimeType);
        setUploadName(name);
        sessionStorage.removeItem("roastlab_upload");
      } catch {
        setError("Failed to read uploaded screenshot.");
        started.current = false;
        return;
      }
    } else {
      form.append("url", url);
    }
    const ctrl = new AbortController();
    fetch("/api/analyze", { method: "POST", body: form, signal: ctrl.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
        while (true) {
          const { done: rd, value } = await reader.read(); if (rd) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
          for (const p of parts) {
            if (!p.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(p.slice(6));
              if (ev.type === "status")      setStatus(ev.payload.message);
              if (ev.type === "screenshot")  setShots(prev => prev.includes(ev.payload.url) ? prev : [...prev, ev.payload.url]);
              if (ev.type === "screenshots") setShots(ev.payload.urls ?? []);
              if (ev.type === "dimension")  setDims(prev => [...prev, ev.payload]);
              if (ev.type === "done") {
                setScore(ev.payload.overallScore);
                setDone(true);
                // Increment session audit count
                const prev = parseInt(localStorage.getItem("roastlab_audit_count") ?? "0");
                localStorage.setItem("roastlab_audit_count", String(prev + 1));
              }
              if (ev.type === "error")      setError(ev.payload.message);
            } catch {/**/ }
          }
        }
      })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tier, paid, upload, isLoaded, isSignedIn]);

  useEffect(() => {
    if (done || error) return;
    const t = setInterval(() => setTaunt(i => (i + 1) % TAUNTS.length), 2600);
    return () => clearInterval(t);
  }, [done, error]);

  function handleDownloadPDF() {
    if (!score) return;
    setPdfLoading(true);
    import("@/lib/generate-pdf").then(({ generateRoastPDF }) => {
      generateRoastPDF({ url: upload ? (uploadName ?? "screenshot") : (cachedUrl || url), score, dims });
      setPdfLoading(false);
    }).catch(() => setPdfLoading(false));
  }

  if (gated) return <AuthGate onSignIn={() => { setGated(false); }} />;

  if (!url && !upload && !cachedId) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#5A5A80", marginBottom: 12, fontSize: 14 }}>No URL or screenshot provided.</p>
        <Link href="/" style={{ color: "#FF2D55", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> back</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "36px 18px 80px", color: "#F0EFF8" }}>

      {/* Top nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2E2E4E", textDecoration: "none" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#6E6D8E")}
          onMouseLeave={e => (e.currentTarget.style.color = "#2E2E4E")}
        >
          <ArrowLeft size={11}/> roastlab
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Flame size={11} color="#FF2D55"/>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#FF2D55" }}>
            {effectiveTier === "full" ? "full roast" : "free roast"}
          </span>
          <span style={{ fontSize: 10, color: "#2E2E4E" }}>· {dims.length}/{effectiveTier === "full" ? 9 : 3}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ padding: "14px 16px", marginBottom: 20, borderRadius: 14, border: "1px solid #E8334A66", background: "#14070A", fontSize: 14, color: "#FF8FA3", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 900 }}>The roaster tripped: </span>{error}
        </motion.div>
      )}

      {/* The roast: cold open, one bit per dimension, verdict */}
      <RoastShow
        siteUrl={cachedUrl || url}
        isUpload={upload}
        shots={shots}
        dims={dims}
        done={done}
        score={score}
        totalBits={effectiveTier === "full" ? 9 : 3}
        status={status}
        taunt={TAUNTS[taunt]}
      />

      {/* Locked + upsell — hidden for admin */}
      {done && effectiveTier !== "full" && (
        <>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: "#2E2E4E" }}>🔒 still locked</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }}/>
            </div>
            {LOCKED_DIMS.map(d => <Locked key={d.key} label={d.label} emoji={d.emoji} />)}
          </div>
          <Upsell siteUrl={url} />
        </>
      )}

      {done && effectiveTier === "full" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          style={{ marginTop: 16, padding: "14px 18px", borderRadius: 12, background: "rgba(50,215,75,0.04)", border: "1px solid rgba(50,215,75,0.14)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{ fontSize: 13, color: "#32D74B", fontWeight: 600 }}>all 9 roasts delivered. the receipts are in. 💀</span>
        </motion.div>
      )}

      {/* PDF download — shows when audit is done */}
      {done && dims.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.4 }}
          style={{ marginTop: 20 }}
        >
          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "13px 20px", borderRadius: 12,
              background: "transparent", border: "1px solid #27273A",
              color: pdfLoading ? "#4A4A62" : "#8B8BA3", fontSize: 13, fontWeight: 600,
              cursor: pdfLoading ? "default" : "pointer", letterSpacing: "-0.01em",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!pdfLoading) { (e.currentTarget as HTMLElement).style.borderColor = "#E8334A44"; (e.currentTarget as HTMLElement).style.color = "#FAFAFA"; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#27273A"; (e.currentTarget as HTMLElement).style.color = "#8B8BA3"; }}
          >
            {pdfLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/> : <Download size={14}/>}
            {pdfLoading ? "Generating PDF…" : "Download Report as PDF"}
          </button>
        </motion.div>
      )}
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div style={{ width: 24, height: 24, border: "2.5px solid rgba(255,45,85,0.15)", borderTopColor: "#FF2D55", borderRadius: "50%" }}
          animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}/>
      </div>
    }>
      <AnalyzeContent />
    </Suspense>
  );
}
