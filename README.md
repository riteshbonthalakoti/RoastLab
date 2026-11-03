<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Space+Grotesk&weight=900&size=48&pause=1000&color=E8334A&center=true&vCenter=true&width=600&lines=ROASTLAB+%F0%9F%94%A5;Website+Roaster+AI;No+Sugar+Coating.;Just+Pure+Roasts." alt="RoastLab" />

<br/>

**AI-powered website auditor that roasts your design, copy, UX, and everything else — with zero mercy.**

<br/>

[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-getroastlab.vercel.app-E8334A?style=for-the-badge&logoColor=white)](https://getroastlab.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js_15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel)](https://vercel.com)
[![License](https://img.shields.io/badge/License-MIT-32D74B?style=for-the-badge)](LICENSE)

<br/>

```
  ◉ ─────── ◉ ─────── ◉
  │   Enter URL        │
  │   Wait 60 seconds  │
  │   Get destroyed    │
  ◉ ─────── ◉ ─────── ◉
```

</div>

---

## 🔥 What is RoastLab?

RoastLab is a **brutally honest AI website auditor**. Drop any URL, and our AI (powered by GPT-4V + Gemini fallback) will analyze it across **9 dimensions** — roasting every bad design decision, weak CTA, accessibility crime, and SEO disaster it finds.

> *"whoever did this ate glue and called it UX"* — ROASTBOT 9000

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🤖 AI Analysis
- **9 audit dimensions** — Visual Design, Copywriting, CTA, UX Flow, Accessibility, Trust Signals, Mobile, Performance, SEO
- **5-provider AI fallback** — OpenRouter → Groq → Gemini
- **Real-time SSE streaming** — results appear as they're analyzed
- **Deep crawl** — Jina AI + raw HTML extraction + subpage crawl for premium

</td>
<td width="50%">

### 💅 User Experience
- **Dark theme** — Linear/Vercel-inspired design
- **Gen Z energy** — savage roasts with Telugu/Hindi meme stickers
- **Clickable screenshots** — full-size crime evidence
- **PDF export** — branded audit report
- **Auto-email** — full report to inbox via Resend

</td>
</tr>
<tr>
<td>

### 🔐 Auth & Accounts
- **Clerk auth** — Google OAuth + email/password
- **Forgot password** — custom 3-step reset flow
- **Profile management** — photo upload + real-time name editing
- **Session gate** — 1 free audit, then sign-in required

</td>
<td>

### 🗄️ Data & Admin
- **Neon Postgres** — all audits persisted
- **Dashboard** — past audits with scores + avg
- **Admin panel** — full audit log + global stats
- **Stripe payments** — Pro + Full plans

</td>
</tr>
</table>

---

## 🚀 Tech Stack

| Layer | Tech |
|-------|------|
| **Framework** | Next.js 15 App Router |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 + inline styles |
| **Animation** | motion/react |
| **Auth** | Clerk v7 |
| **Database** | Neon Postgres (serverless) |
| **AI** | OpenRouter (GPT-4V) + Groq + Gemini |
| **Email** | Resend |
| **Payments** | Stripe |
| **Screenshot** | microlink.io |
| **Crawling** | Jina AI Reader |
| **Deployment** | Vercel |

---

## 📊 Audit Dimensions

```
┌─────────────────────────────────────────────────────────┐
│  FREE (3)              │  FULL (9)                      │
├─────────────────────────────────────────────────────────┤
│  👁  Visual Design     │  🌀 UX Flow                    │
│  ✍️  Copywriting       │  ♿  Accessibility              │
│  🎯  CTA               │  🔒 Trust Signals              │
│                        │  📱 Mobile Experience          │
│                        │  ⚡  Performance               │
│                        │  🔍 SEO                        │
└─────────────────────────────────────────────────────────┘
```

---

## ⚡ Scoring System

```
 85+ ████████████ Elite — genuinely exceptional
 75+ ████████░░░░ Good — someone was awake
 65+ ██████░░░░░░ Decent — moments of competence
 50+ ████░░░░░░░░ Average — participation trophy
 35+ ██░░░░░░░░░░ Bad — publicly tried and failed
 20+ █░░░░░░░░░░░ Disaster — something went wrong
  0+ ░░░░░░░░░░░░ Crime scene — designers quit
```

---

## 🛠️ Local Development

```bash
# Clone
git clone https://github.com/ritesh-1918/roastlab.git
cd roastlab

# Install
npm install --legacy-peer-deps

# Set environment variables
cp .env.example .env.local
# Fill in your keys

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🔧 Environment Variables

```env
# AI Providers
OPENROUTER_KEY_1=sk-or-...
GROQ_KEY_1=gsk_...
GEMINI_API_KEY=...

# Crawling (Firecrawl — firecrawl.dev, optional; falls back to thum.io + Jina when unset)
FIRECRAWL_API_KEY=fc-...

# Self-hosted crawler (see crawler/README.md; optional, tried first)
CRAWLER_URL=https://crawler.example.com
CRAWLER_TOKEN=...

# Auth (Clerk — dashboard.clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Database (Neon Postgres)
DATABASE_URL=postgresql://...

# Email (Resend — resend.com)
RESEND_API_KEY=re_...

# Payments (Stripe)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Admin access (comma-separated emails)
ADMIN_EMAILS=you@example.com
```

---

## 📁 Project Structure

```
roastlab/
├── app/
│   ├── analyze/          # Audit results page (SSE stream)
│   ├── admin/            # Admin dashboard
│   ├── dashboard/        # User dashboard
│   │   ├── page.tsx      # Overview + stats
│   │   ├── reports/      # Audit history
│   │   ├── profile/      # Real-time profile editing
│   │   └── billing/      # Subscription management
│   ├── forgot-password/  # 3-step password reset
│   └── api/
│       ├── analyze/      # SSE audit endpoint
│       ├── audits/       # Audit history API
│       └── webhooks/     # Stripe + Resend webhooks
├── lib/
│   ├── ai/               # 5-provider fallback engine
│   ├── db.ts             # Neon Postgres
│   ├── email.ts          # Resend branded templates
│   ├── screenshot.ts     # Jina + microlink
│   └── generate-pdf.ts   # PDF report
└── components/
    └── landing/          # Homepage sections
```

---

## 🌶️ Meme Integration

Contextual Indian memes on every roast — Telugu/Hindi flavor:

| Score | Meme | Caption |
|-------|------|---------|
| 75+ | Drake (approving) | *"bhai tera site actually fire hai"* |
| 60-74 | Hide the Pain Harold | *"nahi theek nahi hai"* |
| 40-59 | Disaster Girl | *"machi ee design chusav aa 💀"* |
| 25-39 | This Is Fine | *"yaar ye kya kar diya tune"* |
| <25 | Facepalm | *"arey baap re ee site 😭"* |

---

## 📧 Email System (Resend)

Auto-sends branded dark-theme HTML report after every audit:

```
✉️ Audit Report Email
├── Overall score + verdict
├── Each dimension with score + savage summary
├── "View Full Report" CTA back to site
└── Re-roast CTA
```

Set up webhook at `https://your-domain/api/webhooks/resend` in Resend Dashboard → Webhooks for delivery tracking.

---

## 👤 Author

**Ritesh Bonthalakoti** — [@ritesh-1918](https://github.com/ritesh-1918)

---

<div align="center">

**[Live Demo](https://getroastlab.vercel.app)** · **[Report Bug](https://github.com/ritesh-1918/roastlab/issues)** · **[Request Feature](https://github.com/ritesh-1918/roastlab/issues)**

Made with 🔥 in India

</div>
