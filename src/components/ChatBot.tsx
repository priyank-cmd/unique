import React, { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  X,
  Zap,
  RotateCcw,
  ChevronRight,
  Clock,
  Wrench,
  Rocket,
  CheckCircle2,
  ExternalLink,
  Layers,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  ArrowUp,
  PenLine,
  Plus,
  Volume2,
} from "lucide-react";
import { useVoiceChat, unlockAudioContext, playTTSFromAPI, playTTSFromArrayBuffer, fetchTTSAsArrayBuffer, prepareForSpeechExport } from "../hooks/useVoiceChat";
import VoiceChatOverlay from "./VoiceChatOverlay";
import LandingPagePreview from "./LandingPagePreview";
import type { ChatMessage, ProjectPlan, PlanPhase, CallEntry, CallStatus, SRSDocument, DesignPage, DesignPageSection, WireSectionType } from "../types/chat";
import { createDefaultGreeting, DEFAULT_GREETING_OPTIONS } from "../types/chat";
import PlanCard from "./PlanCard";

// ─── Constants ───────────────────────────────────────────────────────────────

// Fixed star positions for case-study cards (deterministic, no random)
const STAR_POSITIONS = [
  { x: 8, y: 12, r: 1.2, o: 0.55 },
  { x: 15, y: 35, r: 0.8, o: 0.38 },
  { x: 25, y: 8, r: 1.0, o: 0.48 },
  { x: 36, y: 22, r: 1.4, o: 0.28 },
  { x: 44, y: 68, r: 0.8, o: 0.45 },
  { x: 55, y: 14, r: 1.2, o: 0.6 },
  { x: 64, y: 42, r: 0.6, o: 0.38 },
  { x: 72, y: 7, r: 1.0, o: 0.65 },
  { x: 82, y: 28, r: 1.5, o: 0.28 },
  { x: 88, y: 55, r: 0.8, o: 0.48 },
  { x: 92, y: 11, r: 1.2, o: 0.58 },
  { x: 78, y: 72, r: 0.6, o: 0.35 },
  { x: 18, y: 85, r: 1.0, o: 0.32 },
  { x: 42, y: 78, r: 1.5, o: 0.22 },
  { x: 60, y: 88, r: 0.8, o: 0.38 },
  { x: 50, y: 50, r: 0.6, o: 0.25 },
  { x: 32, y: 55, r: 1.0, o: 0.3 },
  { x: 96, y: 40, r: 0.8, o: 0.45 },
];

const CS_CARD_THEMES = [
  {
    bg: "linear-gradient(135deg,#040e1c 0%,#082338 55%,#040e1c 100%)",
    accent: "#38bdf8",
    glow: "rgba(56,189,248,0.22)",
    blob: { x: "72%", y: "-18%", c: "rgba(56,189,248,0.18)" },
    dots: true,
  },
  {
    bg: "linear-gradient(135deg,#0f0620 0%,#200d3c 55%,#0f0620 100%)",
    accent: "#a78bfa",
    glow: "rgba(167,139,250,0.20)",
    blob: { x: "60%", y: "20%", c: "rgba(167,139,250,0.20)" },
    dots: false,
  },
  {
    bg: "linear-gradient(135deg,#040f09 0%,#081e12 55%,#040f09 100%)",
    accent: "#34d399",
    glow: "rgba(52,211,153,0.22)",
    blob: { x: "75%", y: "-12%", c: "rgba(52,211,153,0.18)" },
    dots: true,
  },
  {
    bg: "linear-gradient(135deg,#140805 0%,#28160a 55%,#140805 100%)",
    accent: "#fb923c",
    glow: "rgba(251,146,60,0.22)",
    blob: { x: "65%", y: "25%", c: "rgba(251,146,60,0.18)" },
    dots: false,
  },
  {
    bg: "linear-gradient(135deg,#08040e 0%,#180a26 55%,#08040e 100%)",
    accent: "#f472b6",
    glow: "rgba(244,114,182,0.22)",
    blob: { x: "68%", y: "-15%", c: "rgba(244,114,182,0.18)" },
    dots: false,
  },
  {
    bg: "linear-gradient(135deg,#030d14 0%,#061c28 55%,#030d14 100%)",
    accent: "#22d3ee",
    glow: "rgba(34,211,238,0.22)",
    blob: { x: "80%", y: "10%", c: "rgba(34,211,238,0.15)" },
    dots: true,
  },
];

/** White-label branding from `generator.config.json` + `/api/generator-config` (generated clones). */
const DEFAULT_BRAND = {
  brandName: "NineHertz",
  brandLogoSrc: "/assets/icons/Logo_Dark.png",
  companyWebsiteUrl: "https://theninehertz.com",
} as const;

type BrandContextValue = {
  brandName: string;
  brandLogoSrc: string;
  companyWebsiteUrl: string;
};

const BrandContext = createContext<BrandContextValue>({ ...DEFAULT_BRAND });

// Keyword → Unsplash photo ID fallback images (high-quality, free-to-use)
const KEYWORD_IMAGES: Array<{ keys: string[]; photoId: string }> = [
  { keys: ["fitness", "gym", "sport", "health", "workout", "running"], photoId: "1534438327776-62461cae3498" },
  {
    keys: ["food", "restaurant", "delivery", "eat", "meal", "kitchen", "dining"],
    photoId: "1504674900247-0877df9cc836",
  },
  {
    keys: ["ecommerce", "shop", "retail", "fashion", "clothing", "apparel", "kids", "store"],
    photoId: "1441986300917-64674bd600d8",
  },
  {
    keys: ["crm", "saas", "dashboard", "analytics", "enterprise", "software", "platform"],
    photoId: "1551288049-bebda4e38f71",
  },
  {
    keys: ["real estate", "property", "home", "housing", "construction", "building"],
    photoId: "1560518883-ce09059eeffa",
  },
  { keys: ["travel", "hotel", "booking", "tourism", "trip", "vacation"], photoId: "1488646953014-85cb44e25828" },
  { keys: ["healthcare", "medical", "hospital", "doctor", "patient", "clinic"], photoId: "1516549655169-df83a0774514" },
  {
    keys: ["education", "learning", "school", "course", "student", "e-learning"],
    photoId: "1503676260728-1c00da094a0b",
  },
  { keys: ["finance", "banking", "fintech", "payment", "wallet", "crypto"], photoId: "1611974789855-9c05578f3b5e" },
  {
    keys: ["logistics", "transport", "delivery", "shipping", "fleet", "supply"],
    photoId: "1494412574643-ff11b0a5c1c3",
  },
  {
    keys: ["social", "community", "network", "chat", "messaging", "communication"],
    photoId: "1611162617213-7d7a39e9b1d7",
  },
  { keys: ["mobile", "app", "ios", "android", "smartphone"], photoId: "1512941937938-a272e3e2ea90" },
];

function getCaseStudyImage(title: string, imageUrl?: string | null): string | null {
  if (imageUrl) return imageUrl;
  const t = title.toLowerCase();
  for (const { keys, photoId } of KEYWORD_IMAGES) {
    if (keys.some((k) => t.includes(k))) {
      return `https://images.unsplash.com/photo-${photoId}?w=600&q=80&fit=crop`;
    }
  }
  return null;
}

const PILLAR_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  BUILD: {
    bg: "rgba(124,58,237,0.12)",
    border: "rgba(124,58,237,0.35)",
    text: "#a78bfa",
    glow: "rgba(124,58,237,0.25)",
  },
  RUN: { bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.35)", text: "#67e8f9", glow: "rgba(6,182,212,0.25)" },
  EVOLVE: {
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.35)",
    text: "#6ee7b7",
    glow: "rgba(16,185,129,0.25)",
  },
};

const PHASE_ICONS = [Wrench, Rocket, CheckCircle2];

// API base: use VITE_API_URL when backend is on another origin (e.g. production). Dev: Vite proxies /api to localhost:3001.
const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL ? import.meta.env.VITE_API_URL : "";

// ─── Sub-components ──────────────────────────────────────────────────────────

function formatMessage(text: string, isDarkTheme: boolean = true) {
  return text.split("\n").map((line, i, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/);
    return (
      <span key={i}>
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j} className={`${isDarkTheme ? "text-white" : "text-[#0B0B0C]"} font-semibold`}>
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{part}</span>
          ),
        )}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });
}

function DiscoveryProgress({ questionNum }: { questionNum: number }) {
  const steps = [
    { label: "Discovering", active: questionNum >= 1 },
    { label: "Analysing", active: questionNum >= 2 },
    { label: "Roadmap", active: questionNum === 0 },
  ];
  const doneIdx = questionNum === 0 ? 3 : questionNum - 1;

  return (
    <div className="flex items-center justify-center gap-0 py-3 px-5 border-b border-white/6">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all duration-500"
              style={
                i < doneIdx
                  ? { background: "#10B981", color: "#fff" }
                  : i === doneIdx
                    ? {
                      background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                      color: "#fff",
                      boxShadow: "0 0 10px rgba(124,58,237,0.5)",
                    }
                    : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)" }
              }
            >
              {i < doneIdx ? "✓" : i + 1}
            </div>
            <span
              className="text-[9px] font-medium tracking-wide transition-colors duration-300"
              style={{ color: i <= doneIdx ? (i === doneIdx ? "#c4b5fd" : "#10B981") : "rgba(255,255,255,0.25)" }}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="w-8 h-px mx-1.5 mb-3.5 transition-all duration-700"
              style={{ background: i < doneIdx ? "#10B981" : "rgba(255,255,255,0.1)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const DESIGN_FLOW_PAGES = [
  {
    step: 1,
    title: "Discovery & Requirements",
    desc: "We capture your vision, goals, and constraints to align on scope.",
  },
  { step: 2, title: "Wireframes & Flow", desc: "3–4 key screens that map user journeys and information architecture." },
  { step: 3, title: "UI Design Options", desc: "Polished design directions for you to review and choose from." },
  { step: 4, title: "Final Screens for Approval", desc: "Refined designs ready for sign-off before development." },
];

// ─── SRS Document Card ────────────────────────────────────────────────────────

// ─── Design Agent components ──────────────────────────────────────────────────

const WIRE_HEIGHTS: Record<WireSectionType | string, number> = {
  nav: 6,
  hero: 20,
  grid: 18,
  cards: 16,
  list: 14,
  form: 22,
  stats: 14,
  banner: 8,
  tabs: 14,
  footer: 10,
  bottomnav: 8,
  content: 12,
};

function WireframeSection({ section, primary, isDarkTheme = true }: { section: DesignPageSection; primary: string; isDarkTheme?: boolean }) {
  const h = WIRE_HEIGHTS[section.type] ?? 10;
  const bar = isDarkTheme ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  if (section.type === "nav") {
    return (
      <div
        className="flex items-center justify-between px-1.5"
        style={{ height: h, borderBottom: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="rounded-sm" style={{ width: 8, height: 4, background: primary, opacity: 0.7 }} />
        <div className="flex gap-1">
          <div className="rounded-sm" style={{ width: 10, height: 2, background: bar }} />
          <div className="rounded-sm" style={{ width: 10, height: 2, background: bar }} />
        </div>
      </div>
    );
  }

  if (section.type === "hero") {
    return (
      <div className="flex flex-col items-center justify-center gap-1 px-2" style={{ height: h }}>
        <div className="rounded-sm" style={{ width: "60%", height: 3, background: isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }} />
        <div className="rounded-sm" style={{ width: "40%", height: 2, background: bar }} />
        <div
          className="rounded-sm mt-0.5"
          style={{ width: 20, height: 4, borderRadius: 2, background: primary, opacity: 0.6 }}
        />
      </div>
    );
  }

  if (section.type === "grid" || section.type === "cards") {
    return (
      <div className="px-1.5 py-1" style={{ height: h }}>
        <div className="grid grid-cols-3 gap-1 h-full">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{
                background: i === 1 ? `${primary}20` : (isDarkTheme ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
                border: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "bottomnav") {
    return (
      <div
        className="flex items-center justify-around px-1.5"
        style={{ height: h, borderTop: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)" }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-full"
            style={{ width: 4, height: 4, background: i === 0 ? primary : bar, opacity: i === 0 ? 0.7 : 1 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="px-1.5 py-0.5" style={{ height: h }}>
      <div
        className="rounded-sm w-full h-full"
        style={{ 
          background: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
          border: isDarkTheme ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)"
        }}
      />
    </div>
  );
}

function DesignPagesCard({ pages, isDarkTheme = true }: { pages: DesignPage[]; isDarkTheme?: boolean }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const page = pages[activeIdx];
  const primary = page?.colorPalette?.primary || "#7c3aed";
  const isMobile = page?.platform === "mobile";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl overflow-hidden mt-3 w-full"
      style={{
        background: isDarkTheme ? "rgba(5,4,16,0.98)" : "#ffffff",
        border: "1px solid rgba(124,58,237,0.28)",
        boxShadow: isDarkTheme 
          ? "0 0 50px rgba(124,58,237,0.12), 0 16px 48px rgba(0,0,0,0.5)"
          : "0 0 30px rgba(124,58,237,0.08), 0 8px 24px rgba(0,0,0,0.1)",
      }}
    >
      {/* Header */}
      <div className={`px-4 pt-4 pb-3 ${isDarkTheme ? "" : ""}`} style={{ borderBottom: isDarkTheme ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[9px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full"
            style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}
          >
            UI Design Pages
          </span>
          <span className={`text-[9px] ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>{pages.length} screens</span>
        </div>
        {/* Page tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {pages.map((p, i) => (
            <motion.button
              key={p.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveIdx(i)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all"
              style={
                i === activeIdx
                  ? { background: `${primary}22`, color: primary, border: `1px solid ${primary}55` }
                  : {
                    background: isDarkTheme ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                    color: isDarkTheme ? "rgba(255,255,255,0.4)" : "rgba(11,11,12,0.6)",
                    border: isDarkTheme ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                  }
              }
            >
              <span>{p.icon}</span>
              <span>{p.name}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Active page */}
      <AnimatePresence mode="wait">
        <motion.div
          key={page.id}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.18 }}
          className="p-4"
        >
          <div className="flex gap-4">
            {/* ── Wireframe preview ── */}
            <div className="flex-shrink-0" style={{ width: isMobile ? 120 : 190 }}>
              <p className={`text-[8px] uppercase tracking-wide text-center mb-1.5 ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}>
                {isMobile ? "📱 Mobile" : "🖥 Web"}
              </p>
              {isMobile ? (
                /* Phone frame */
                <div
                  className="rounded-2xl p-2 mx-auto"
                  style={{
                    background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                    border: isDarkTheme ? "2px solid rgba(255,255,255,0.14)" : "2px solid rgba(0,0,0,0.12)",
                    width: 110,
                  }}
                >
                  <div
                    className="w-8 h-1.5 rounded-full mx-auto mb-2"
                    style={{ background: isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}
                  />
                  <div
                    className="space-y-1.5"
                    style={{ background: page.colorPalette?.background || (isDarkTheme ? "#0a0a16" : "#ffffff"), borderRadius: 6, padding: 4 }}
                  >
                    {page.sections.map((s, i) => (
                      <WireframeSection key={i} section={s} primary={primary} isDarkTheme={isDarkTheme} />
                    ))}
                  </div>
                  <div
                    className="w-10 h-1 rounded-full mx-auto mt-2"
                    style={{ background: isDarkTheme ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)" }}
                  />
                </div>
              ) : (
                /* Browser frame */
                <div className="rounded-lg overflow-hidden" style={{ border: isDarkTheme ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)" }}>
                  <div
                    className="flex items-center gap-1 px-2 py-1.5"
                    style={{ 
                      background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                      borderBottom: isDarkTheme ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.08)"
                    }}
                  >
                    {["#ef4444", "#f59e0b", "#10b981"].map((c) => (
                      <div key={c} className="w-2 h-2 rounded-full" style={{ background: c, opacity: 0.6 }} />
                    ))}
                    <div className="flex-1 h-3 rounded-sm mx-2" style={{ background: isDarkTheme ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
                  </div>
                  <div className="p-2 space-y-1.5" style={{ background: page.colorPalette?.background || (isDarkTheme ? "#0a0a16" : "#ffffff") }}>
                    {page.sections.map((s, i) => (
                      <WireframeSection key={i} section={s} primary={primary} isDarkTheme={isDarkTheme} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Page details ── */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-2xl leading-none mt-0.5">{page.icon}</span>
                <div>
                  <h3 className={`text-[13px] font-bold leading-tight ${isDarkTheme ? "text-white" : "text-[#0B0B0C]"}`}>{page.name}</h3>
                  {page.tagline && <p className={`text-[10px] mt-0.5 ${isDarkTheme ? "text-white/40" : "text-[rgba(11,11,12,0.6)]"}`}>{page.tagline}</p>}
                </div>
              </div>

              <span
                className="inline-block px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide mb-3"
                style={{ background: `${primary}18`, color: primary, border: `1px solid ${primary}30` }}
              >
                {page.type}
              </span>

              {/* Components */}
              <div className="mb-3">
                <p className={`text-[8px] font-bold uppercase tracking-wide mb-1.5 ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}>UI Components</p>
                <div className="flex flex-wrap gap-1">
                  {page.keyComponents.map((c, i) => (
                    <span
                      key={i}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${isDarkTheme ? "text-white/55" : "text-[rgba(11,11,12,0.7)]"}`}
                      style={{ 
                        background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                        border: isDarkTheme ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)"
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {/* Design rationale */}
              {page.designRationale && (
                <div className="mb-3">
                  <p className={`text-[8px] font-bold uppercase tracking-wide mb-1 ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}>Design Rationale</p>
                  <p className={`text-[10px] leading-relaxed ${isDarkTheme ? "text-white/45" : "text-[rgba(11,11,12,0.7)]"}`}>{page.designRationale}</p>
                </div>
              )}

              {/* User flow */}
              {page.userFlow && (
                <div>
                  <p className={`text-[8px] font-bold uppercase tracking-wide mb-1 ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}>User Flow</p>
                  <p className={`text-[10px] leading-relaxed ${isDarkTheme ? "text-white/40" : "text-[rgba(11,11,12,0.7)]"}`}>{page.userFlow}</p>
                </div>
              )}
            </div>
          </div>

          {/* Color palette */}
          {page.colorPalette && Object.keys(page.colorPalette).length > 0 && (
            <div
              className="mt-4 pt-3 flex items-center gap-3 flex-wrap"
              style={{ borderTop: isDarkTheme ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.08)" }}
            >
              <span className={`text-[8px] font-bold uppercase tracking-wide ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}>Colour Palette</span>
              {Object.entries(page.colorPalette).map(([key, color]) =>
                color ? (
                  <div key={key} className="flex items-center gap-1.5">
                    <div
                      className="w-4 h-4 rounded-sm shadow-sm"
                      style={{ background: color, border: isDarkTheme ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)" }}
                    />
                    <div>
                      <p className={`text-[7px] font-bold uppercase tracking-wide ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>{key}</p>
                      <p className={`text-[7px] font-mono ${isDarkTheme ? "text-white/20" : "text-[rgba(11,11,12,0.4)]"}`}>{color}</p>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}

          {/* Page navigation dots */}
          <div className="mt-3 flex justify-center gap-1.5">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === activeIdx ? 16 : 6,
                  height: 6,
                  background: i === activeIdx ? primary : (isDarkTheme ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"),
                }}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// SRS accordion subcomponents (declared outside SRSCard to avoid "components during render" / state reset)
function SRSSectionHeader({
  id,
  label,
  count,
  openSection,
  onToggle,
  isDarkTheme = true,
}: {
  id: string;
  label: string;
  count?: number;
  openSection: string | null;
  onToggle: (key: string) => void;
  isDarkTheme?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${isDarkTheme ? "hover:bg-white/[0.03]" : "hover:bg-black/[0.03]"}`}
      style={{ borderBottom: isDarkTheme ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.08)" }}
    >
      <span className={`text-[11px] font-bold tracking-wide uppercase ${isDarkTheme ? "text-white/70" : "text-[#0B0B0C]"}`}>{label}</span>
      <div className="flex items-center gap-2">
        {count !== undefined && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-md font-mono"
            style={{ background: "rgba(124,58,237,0.18)", color: "#a78bfa" }}
          >
            {count}
          </span>
        )}
        <motion.span
          animate={{ rotate: openSection === id ? 90 : 0 }}
          transition={{ duration: 0.18 }}
          className={isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}
        >
          <ChevronRight size={11} />
        </motion.span>
      </div>
    </button>
  );
}

function SRSSectionBody({
  id,
  children,
  openSection,
  isDarkTheme = true,
}: {
  id: string;
  children: React.ReactNode;
  openSection: string | null;
  isDarkTheme?: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {openSection === id && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden"
        >
          <div className={`px-4 py-3 border-b ${isDarkTheme ? "border-white/[0.04]" : "border-[rgba(0,0,0,0.08)]"}`}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SRSCard({ srs, isDarkTheme = true }: { srs: SRSDocument; isDarkTheme?: boolean }) {
  const { brandName, companyWebsiteUrl } = useContext(BrandContext);
  const contactHref = `${String(companyWebsiteUrl || DEFAULT_BRAND.companyWebsiteUrl).replace(/\/$/, "")}/contact`;
  const [openSection, setOpenSection] = useState<string | null>("functional");
  const [designPages, setDesignPages] = useState<DesignPage[] | null>(null);
  const [designLoading, setDesignLoading] = useState(false);
  const [landingHtml, setLandingHtml] = useState<string | null>(null);
  const [landingLoading, setLandingLoading] = useState(false);
  const colors = PILLAR_COLORS[srs.pillar || "BUILD"];

  const toggle = (key: string) => setOpenSection((prev) => (prev === key ? null : key));

  const generateDesigns = async () => {
    setDesignLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/design-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srs }),
      });
      const data = await res.json();
      if (Array.isArray(data.pages) && data.pages.length > 0) setDesignPages(data.pages);
    } catch (e) {
      console.warn("Design agent request failed:", e);
    }
    setDesignLoading(false);
  };

  const generateLandingPage = async () => {
    setLandingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/landing-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srs }),
      });
      const data = await res.json();
      if (data.html) setLandingHtml(data.html);
    } catch (e) {
      console.warn("Landing page request failed:", e);
    }
    setLandingLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl overflow-hidden mt-3 w-full"
      style={{
        background: isDarkTheme ? "rgba(6,5,16,0.97)" : "#ffffff",
        border: `1px solid ${colors.border}`,
        boxShadow: isDarkTheme 
          ? `0 0 40px ${colors.glow}, 0 12px 40px rgba(0,0,0,0.5)`
          : `0 0 20px ${colors.glow}, 0 8px 24px rgba(0,0,0,0.1)`,
      }}
    >
      {/* ── Document Header ─────────────────── */}
      <div className="px-5 pt-5 pb-4" style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
              style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              SRS v{srs.version || "1.0"}
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
              style={{
                background: "rgba(16,185,129,0.12)",
                color: "#6ee7b7",
                border: "1px solid rgba(16,185,129,0.3)",
              }}
            >
              {srs.pillar || "BUILD"} Pillar
            </span>
          </div>
          {srs.estimatedTimeline && (
            <div className="flex items-center gap-1.5">
              <Clock size={10} style={{ color: colors.text }} />
              <span className="text-[10px] font-medium" style={{ color: colors.text }}>
                {srs.estimatedTimeline}
              </span>
            </div>
          )}
        </div>
        <h3 className={`text-[15px] font-bold leading-snug mb-1 ${isDarkTheme ? "text-white" : "text-[#0B0B0C]"}`}>{srs.title}</h3>
        {srs.executiveSummary && (
          <p className={`text-[11px] leading-relaxed mt-1.5 ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.6)]"}`}>{srs.executiveSummary}</p>
        )}
      </div>

      {/* ── Key Stats Row ────────────────────── */}
      <div
        className={`grid grid-cols-3 divide-x ${isDarkTheme ? "divide-white/[0.05]" : "divide-[rgba(0,0,0,0.08)]"}`}
        style={{ borderBottom: isDarkTheme ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.08)" }}
      >
        {[
          { label: "FR Modules", value: (srs.functionalRequirements || []).length || "—" },
          { label: "User Stories", value: (srs.userStories || []).length || "—" },
          { label: "Budget", value: srs.budgetRange || "TBC" },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-2.5 text-center">
            <div className={`text-[14px] font-bold ${isDarkTheme ? "text-white/90" : "text-[#0B0B0C]"}`}>{value}</div>
            <div className={`text-[9px] mt-0.5 uppercase tracking-wide ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Collapsible Sections ─────────────── */}

      {/* Business Objective */}
      {srs.businessObjective && (
        <>
          <SRSSectionHeader id="business" label="Business Objective" openSection={openSection} onToggle={toggle} isDarkTheme={isDarkTheme} />
          <SRSSectionBody id="business" openSection={openSection} isDarkTheme={isDarkTheme}>
            <p className={`text-[11px] leading-relaxed ${isDarkTheme ? "text-white/60" : "text-[rgba(11,11,12,0.7)]"}`}>{srs.businessObjective}</p>
            {srs.successMetrics && srs.successMetrics.length > 0 && (
              <div className="mt-2.5 space-y-1">
                <p className={`text-[9px] uppercase font-bold tracking-wide mb-1.5 ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>Success Metrics</p>
                {srs.successMetrics.map((m, i) => (
                  <div key={i} className={`flex items-start gap-2 text-[11px] ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.7)]"}`}>
                    <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#10B981" }} />
                    {m}
                  </div>
                ))}
              </div>
            )}
          </SRSSectionBody>
        </>
      )}

      {/* Target Users */}
      {srs.targetUsers && srs.targetUsers.length > 0 && (
        <>
          <SRSSectionHeader
            id="users"
            label="Target Users"
            count={srs.targetUsers.length}
            openSection={openSection}
            onToggle={toggle}
            isDarkTheme={isDarkTheme}
          />
          <SRSSectionBody id="users" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="space-y-2.5">
              {srs.targetUsers.map((u, i) => (
                <div
                  key={i}
                  className="rounded-lg p-3"
                  style={{ 
                    background: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                    border: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)"
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold ${isDarkTheme ? "text-white/80" : "text-[#0B0B0C]"}`}>{u.persona}</span>
                    {u.volume && <span className={`text-[9px] font-mono ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>{u.volume}</span>}
                  </div>
                  <p className={`text-[10px] leading-relaxed ${isDarkTheme ? "text-white/45" : "text-[rgba(11,11,12,0.7)]"}`}>{u.needs}</p>
                </div>
              ))}
            </div>
          </SRSSectionBody>
        </>
      )}

      {/* Scope */}
      {srs.scope && (
        <>
          <SRSSectionHeader id="scope" label="Project Scope" openSection={openSection} onToggle={toggle} isDarkTheme={isDarkTheme} />
          <SRSSectionBody id="scope" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={`text-[9px] font-bold uppercase tracking-wide mb-1.5 ${isDarkTheme ? "text-emerald-400/60" : "text-emerald-600"}`}>In Scope</p>
                <div className="space-y-1">
                  {(srs.scope.inScope || []).map((item, i) => (
                    <div key={i} className={`flex items-start gap-1.5 text-[10px] ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.7)]"}`}>
                      <span className={`mt-1 flex-shrink-0 text-[8px] ${isDarkTheme ? "text-emerald-400" : "text-emerald-600"}`}>✓</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className={`text-[9px] font-bold uppercase tracking-wide mb-1.5 ${isDarkTheme ? "text-red-400/60" : "text-red-600"}`}>Out of Scope</p>
                <div className="space-y-1">
                  {(srs.scope.outOfScope || []).map((item, i) => (
                    <div key={i} className={`flex items-start gap-1.5 text-[10px] ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.7)]"}`}>
                      <span className={`mt-1 flex-shrink-0 text-[8px] ${isDarkTheme ? "text-red-400/60" : "text-red-600"}`}>✕</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SRSSectionBody>
        </>
      )}

      {/* Functional Requirements */}
      {srs.functionalRequirements && srs.functionalRequirements.length > 0 && (
        <>
          <SRSSectionHeader
            id="functional"
            label="Functional Requirements"
            count={(srs.functionalRequirements || []).reduce((a, m) => a + m.requirements.length, 0)}
            openSection={openSection}
            onToggle={toggle}
            isDarkTheme={isDarkTheme}
          />
          <SRSSectionBody id="functional" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="space-y-3">
              {srs.functionalRequirements.map((module, mi) => (
                <div
                  key={mi}
                  className="rounded-xl overflow-hidden"
                  style={{ 
                    background: isDarkTheme ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                    border: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)"
                  }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2"
                    style={{ borderBottom: isDarkTheme ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.08)" }}
                  >
                    <span className={`text-[11px] font-semibold ${isDarkTheme ? "text-white/80" : "text-[#0B0B0C]"}`}>{module.module}</span>
                    <span
                      className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase"
                      style={{
                        background: module.priority === "Must Have" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                        color: module.priority === "Must Have" ? "#6ee7b7" : "#fcd34d",
                        border: `1px solid ${module.priority === "Must Have" ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                      }}
                    >
                      {module.priority}
                    </span>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    {module.requirements.map((req, ri) => (
                      <div key={ri} className={`flex items-start gap-2 text-[10px] leading-relaxed ${isDarkTheme ? "text-white/45" : "text-[rgba(11,11,12,0.7)]"}`}>
                        <span className={`flex-shrink-0 font-mono text-[8px] mt-0.5 ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}>
                          {String(ri + 1).padStart(2, "0")}
                        </span>
                        {req}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SRSSectionBody>
        </>
      )}

      {/* Non-Functional Requirements */}
      {srs.nonFunctionalRequirements && (
        <>
          <SRSSectionHeader id="nfr" label="Non-Functional Requirements" openSection={openSection} onToggle={toggle} isDarkTheme={isDarkTheme} />
          <SRSSectionBody id="nfr" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="space-y-2">
              {Object.entries(srs.nonFunctionalRequirements).map(([key, value]) =>
                value ? (
                  <div key={key} className="flex gap-3">
                    <span
                      className="flex-shrink-0 text-[9px] font-bold uppercase pt-0.5 w-20"
                      style={{ color: colors.text }}
                    >
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </span>
                    <span className={`text-[10px] leading-relaxed ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.7)]"}`}>{value}</span>
                  </div>
                ) : null,
              )}
            </div>
          </SRSSectionBody>
        </>
      )}

      {/* User Stories */}
      {srs.userStories && srs.userStories.length > 0 && (
        <>
          <SRSSectionHeader
            id="stories"
            label="User Stories"
            count={srs.userStories.length}
            openSection={openSection}
            onToggle={toggle}
            isDarkTheme={isDarkTheme}
          />
          <SRSSectionBody id="stories" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="space-y-2">
              {srs.userStories.map((story, i) => (
                <div key={i} className={`flex items-start gap-2 text-[10px] leading-relaxed ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.7)]"}`}>
                  <span
                    className="flex-shrink-0 w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center mt-0.5"
                    style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}
                  >
                    {i + 1}
                  </span>
                  {story}
                </div>
              ))}
            </div>
          </SRSSectionBody>
        </>
      )}

      {/* System Architecture */}
      {srs.systemArchitecture && (
        <>
          <SRSSectionHeader
            id="arch"
            label="System Architecture & Tech Stack"
            openSection={openSection}
            onToggle={toggle}
            isDarkTheme={isDarkTheme}
          />
          <SRSSectionBody id="arch" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(srs.systemArchitecture).map(([layer, techs]) =>
                techs && techs.length > 0 ? (
                  <div key={layer}>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: colors.text }}>
                      {layer.charAt(0).toUpperCase() + layer.slice(1)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {techs.map((t) => (
                        <span
                          key={t}
                          className={`px-2 py-0.5 rounded text-[9px] font-mono ${isDarkTheme ? "text-white/40" : "text-[rgba(11,11,12,0.6)]"}`}
                          style={{ 
                            background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                            border: isDarkTheme ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)"
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
            {srs.integrations && srs.integrations.length > 0 && (
              <div className={`mt-3 pt-3 border-t ${isDarkTheme ? "border-white/[0.05]" : "border-[rgba(0,0,0,0.08)]"}`}>
                <p className={`text-[9px] font-bold uppercase tracking-wide mb-2 ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>Integrations</p>
                <div className="space-y-1.5">
                  {srs.integrations.map((intg, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`text-[9px] font-bold flex-shrink-0 w-24 truncate ${isDarkTheme ? "text-white/70" : "text-[#0B0B0C]"}`}>
                        {intg.service}
                      </span>
                      <span className={`text-[9px] flex-1 ${isDarkTheme ? "text-white/40" : "text-[rgba(11,11,12,0.6)]"}`}>{intg.purpose}</span>
                      {intg.priority && (
                        <span className={`text-[8px] flex-shrink-0 font-semibold ${isDarkTheme ? "text-emerald-400/60" : "text-emerald-600"}`}>
                          {intg.priority}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SRSSectionBody>
        </>
      )}

      {/* Security & Compliance */}
      {((srs.securityCompliance && srs.securityCompliance.length > 0) || srs.dataRequirements) && (
        <>
          <SRSSectionHeader id="security" label="Security & Compliance" openSection={openSection} onToggle={toggle} isDarkTheme={isDarkTheme} />
          <SRSSectionBody id="security" openSection={openSection} isDarkTheme={isDarkTheme}>
            {srs.securityCompliance && srs.securityCompliance.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {srs.securityCompliance.map((s) => (
                  <span
                    key={s}
                    className="px-2.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{
                      background: "rgba(239,68,68,0.1)",
                      color: "#fca5a5",
                      border: "1px solid rgba(239,68,68,0.25)",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            {srs.dataRequirements && (
              <p className={`text-[10px] leading-relaxed ${isDarkTheme ? "text-white/45" : "text-[rgba(11,11,12,0.7)]"}`}>{srs.dataRequirements}</p>
            )}
          </SRSSectionBody>
        </>
      )}

      {/* Development Phases */}
      {srs.phases && srs.phases.length > 0 && (
        <>
          <SRSSectionHeader
            id="phases"
            label="Development Phases"
            count={srs.phases.length}
            openSection={openSection}
            onToggle={toggle}
            isDarkTheme={isDarkTheme}
          />
          <SRSSectionBody id="phases" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="space-y-2">
              {srs.phases.map((phase, idx) => {
                const PhaseIcon = PHASE_ICONS[idx] || Rocket;
                return (
                  <div
                    key={phase.num}
                    className="rounded-xl overflow-hidden"
                    style={{ 
                      background: isDarkTheme ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                      border: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)"
                    }}
                  >
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                      >
                        <PhaseIcon size={11} style={{ color: colors.text }} />
                      </div>
                      <span className={`text-[11px] font-semibold flex-1 ${isDarkTheme ? "text-white/80" : "text-[#0B0B0C]"}`}>
                        Phase {phase.num} — {phase.name}
                      </span>
                      <span className={`text-[10px] ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>{phase.duration}</span>
                    </div>
                    <div className="px-3 pb-2.5 flex flex-wrap gap-1">
                      {phase.tasks.map((task, ti) => (
                        <span
                          key={ti}
                          className={`text-[9px] px-2 py-0.5 rounded ${isDarkTheme ? "text-white/40" : "text-[rgba(11,11,12,0.7)]"}`}
                          style={{ 
                            background: isDarkTheme ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                            border: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)"
                          }}
                        >
                          {task}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SRSSectionBody>
        </>
      )}

      {/* Risks & Assumptions */}
      {srs.risks && srs.risks.length > 0 && (
        <>
          <SRSSectionHeader
            id="risks"
            label="Risks & Assumptions"
            count={(srs.risks || []).length + (srs.assumptions || []).length}
            openSection={openSection}
            onToggle={toggle}
            isDarkTheme={isDarkTheme}
          />
          <SRSSectionBody id="risks" openSection={openSection} isDarkTheme={isDarkTheme}>
            <div className="space-y-2 mb-3">
              <p className={`text-[9px] font-bold uppercase tracking-wide mb-1.5 ${isDarkTheme ? "text-red-400/50" : "text-red-600"}`}>Identified Risks</p>
              {srs.risks.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg p-2.5"
                  style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-semibold ${isDarkTheme ? "text-white/70" : "text-[#0B0B0C]"}`}>{r.risk}</span>
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase"
                      style={{
                        color: r.impact === "High" ? "#fca5a5" : r.impact === "Medium" ? "#fcd34d" : "#6ee7b7",
                        background:
                          r.impact === "High"
                            ? "rgba(239,68,68,0.15)"
                            : r.impact === "Medium"
                              ? "rgba(245,158,11,0.15)"
                              : "rgba(16,185,129,0.15)",
                      }}
                    >
                      {r.impact}
                    </span>
                  </div>
                  <p className={`text-[9px] ${isDarkTheme ? "text-white/40" : "text-[rgba(11,11,12,0.6)]"}`}>↳ {r.mitigation}</p>
                </div>
              ))}
            </div>
            {srs.assumptions && srs.assumptions.length > 0 && (
              <div>
                <p className={`text-[9px] font-bold uppercase tracking-wide mb-1.5 ${isDarkTheme ? "text-amber-400/50" : "text-amber-600"}`}>Assumptions</p>
                <div className="space-y-1">
                  {srs.assumptions.map((a, i) => (
                    <div key={i} className={`flex items-start gap-2 text-[10px] ${isDarkTheme ? "text-white/45" : "text-[rgba(11,11,12,0.7)]"}`}>
                      <span className={`flex-shrink-0 mt-0.5 ${isDarkTheme ? "text-amber-400/60" : "text-amber-600"}`}>△</span>
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SRSSectionBody>
        </>
      )}

      {/* Team & Timeline */}
      {(srs.teamStructure || srs.budgetRange) && (
        <div className={`px-5 py-3 flex flex-wrap gap-4 ${isDarkTheme ? "" : ""}`} style={{ borderTop: isDarkTheme ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.08)" }}>
          {srs.teamStructure && (
            <div className="flex-1 min-w-0">
              <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>Recommended Team</p>
              <p className={`text-[11px] ${isDarkTheme ? "text-white/55" : "text-[rgba(11,11,12,0.7)]"}`}>{srs.teamStructure}</p>
            </div>
          )}
          {srs.budgetRange && srs.budgetRange !== "To be confirmed" && (
            <div className="flex-shrink-0">
              <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>Budget Range</p>
              <p className="text-[12px] font-bold" style={{ color: colors.text }}>
                {srs.budgetRange}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Design Pages */}
      {designPages ? (
        <DesignPagesCard pages={designPages} isDarkTheme={isDarkTheme} />
      ) : (
        <div className="px-5 pb-3 pt-3">
          <button
            type="button"
            onClick={generateDesigns}
            disabled={designLoading}
            className="w-full py-2.5 rounded-xl text-[11px] font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", color: "#a78bfa" }}
          >
            {designLoading ? (
              <>
                <span className="animate-pulse">✦</span> Designing pages...
              </>
            ) : (
              <>✦ Generate Design Pages</>
            )}
          </button>
        </div>
      )}

      {/* Landing Page Generator */}
      {landingHtml ? (
        <LandingPagePreview html={landingHtml} title={srs.title || "landing"} />
      ) : (
        <div className="px-5 pb-3">
          <button
            type="button"
            onClick={generateLandingPage}
            disabled={landingLoading}
            className="w-full py-2.5 rounded-xl text-[11px] font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.28)", color: "#6ee7b7" }}
          >
            {landingLoading ? (
              <>
                <span className="animate-pulse">✦</span> Building landing page...
              </>
            ) : (
              <>🌐 Generate Landing Page</>
            )}
          </button>
        </div>
      )}

      {/* CTA */}
      <div className="px-5 pb-5 pt-3">
        <a
          href={contactHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[12px] font-semibold transition-all hover:scale-[1.02] active:scale-95 ${isDarkTheme ? "text-white" : "text-white"}`}
          style={{
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
            boxShadow: "0 0 24px rgba(124,58,237,0.35)",
          }}
        >
          <Zap size={13} fill="white" className="flex-shrink-0" />
          {srs.nextStep || `Schedule Scoping Call with ${brandName}`}
          <ExternalLink size={10} className="flex-shrink-0" />
        </a>
      </div>
    </motion.div>
  );
}

// ─── Timestamp formatter ──────────────────────────────────────────────────────

function formatTime(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

// ─── Welcome screen card config ──────────────────────────────────────────────

const WELCOME_CARDS: Array<{
  label: string;
  Icon: React.ComponentType<{ size?: number | string }>;
  iconBg: string;
  iconColor: string;
  activeBg: string;
  activeBorder: string;
}> = [
    {
      label: "CRM/ERP System",
      Icon: Wrench,
      iconBg: "rgba(124,58,237,0.18)",
      iconColor: "#c4b5fd",
      activeBg: "rgba(124,58,237,0.10)",
      activeBorder: "rgba(124,58,237,0.45)",
    },
    {
      label: "Mobile Application",
      Icon: Rocket,
      iconBg: "rgba(6,182,212,0.16)",
      iconColor: "#67e8f9",
      activeBg: "rgba(6,182,212,0.08)",
      activeBorder: "rgba(6,182,212,0.4)",
    },
    {
      label: "AI Integration",
      Icon: Zap,
      iconBg: "rgba(16,185,129,0.16)",
      iconColor: "#6ee7b7",
      activeBg: "rgba(16,185,129,0.08)",
      activeBorder: "rgba(16,185,129,0.4)",
    },
    {
      label: "Cloud/DevOps",
      Icon: Layers,
      iconBg: "rgba(14,165,233,0.16)",
      iconColor: "#7dd3fc",
      activeBg: "rgba(14,165,233,0.08)",
      activeBorder: "rgba(14,165,233,0.4)",
    },
    {
      label: "E-Commerce Platform",
      Icon: CheckCircle2,
      iconBg: "rgba(245,158,11,0.16)",
      iconColor: "#fcd34d",
      activeBg: "rgba(245,158,11,0.08)",
      activeBorder: "rgba(245,158,11,0.4)",
    },
  ];

// ─── Welcome home screen ──────────────────────────────────────────────────────

function WelcomeScreen({
  message,
  onOptionClick,
  input,
  onInputChange,
  onSend,
  loading,
  chatEnabled = true,
  isDarkTheme = true,
  onMicClick,
  voiceSupported = false,
  voiceActive = false,
}: {
  message: ChatMessage;
  onOptionClick: (opt: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onSend: (v: string) => void;
  loading: boolean;
  chatEnabled?: boolean;
  isDarkTheme?: boolean;
  onMicClick?: () => void;
  voiceSupported?: boolean;
  voiceActive?: boolean;
}) {
  const options = message.options ?? [];
  if (chatEnabled && options.length === 0) return null;

  return (
    <div className="flex flex-col items-center w-full px-4" style={{ maxWidth: 1100 }}>
      <div className="flex flex-col w-full" style={{ gap: 40 }}>
        {/* Text block: heading + subtitle */}
        <div className="flex flex-col items-center text-center" style={{ gap: 8 }}>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className={`leading-tight tracking-tight text-[26px] sm:text-[32px] ${isDarkTheme ? "font-medium" : "text-[#0B0B0C]"}`}
          >
            {/* We're here to help – start typing below */}
            Let’s transform your vision into a digital experience that stands out.
          </motion.h1>
          {/* <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className={`leading-tight tracking-tight text-[26px] sm:text-[28px] ${isDarkTheme ? "font-medium" : "text-[#0B0B0C]"}`}
            style={{ color: isDarkTheme ? "#ffffff" : "#0B0B0C" }}
          >
       
            Describe your project type or business need to get startedis.
          </motion.h2> */}

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07, duration: 0.28, ease: "easeOut" }}
            className="leading-relaxed text-[13px] sm:text-[15px]"
            style={{ color: isDarkTheme ? "rgba(255,255,255,0.45)" : "#0B0B0C" }}
          >
            Describe your project type or business need to get started.
          </motion.p>
        </div>

        {/* Input + category buttons */}
        {chatEnabled && (
          <div className="flex flex-col w-full" style={{ gap: 20 }}>
          {/* Textarea-style input box */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.28, ease: "easeOut" }}
            className="w-full relative flex flex-col"
            style={{
              background: isDarkTheme ? "#11110e" : "#f7f7f7",
              border: isDarkTheme ? "1px solid #292927" : "1px solid rgba(0,0,0,0.12)",
              borderRadius: 20,
              minHeight: 134,
            }}
          >
            {/* Text area */}
            <div className="flex-1 px-5 pt-4 pb-12">
              <input
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend(input);
                  }
                }}
                placeholder="Describe your idea..."
                disabled={loading}
                className="w-full bg-transparent text-[15px] outline-none disabled:opacity-50"
                // className="w-full bg-transparent text-white placeholder-white/30 outline-none disabled:opacity-50"
                style={{
                  fontSize: 15,
                  color: isDarkTheme ? undefined : "rgb(11, 11, 12)",
                }}
                />
            </div>
            {/* + button bottom-left */}
            <div className="absolute bottom-3 left-4 flex items-center">
              {/* <button
                className="w-9 h-9 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
                style={{ background: isDarkTheme ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
                tabIndex={-1}
                type="button"
              >
                <Plus size={18} className={isDarkTheme ? "text-white/70" : "text-gray-500"} />
              </button> */}
            </div>
            {/* Mic + Send buttons bottom-right — same voice flow as inside chat; show muted when voice is on */}
            <div className="absolute bottom-3 right-4 flex items-center gap-2">
              {voiceSupported && (
                <button
                  type="button"
                  onClick={onMicClick}
                  title={voiceActive ? "Exit voice mode" : "Voice input"}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-opacity ${isDarkTheme ? "border-white/10 hover:bg-white/20" : "border-[#0B0B0C1A] hover:bg-gray-500/10"}`}
                >
                  {voiceActive ? (
                    <MicOff size={17} className={isDarkTheme ? "text-white/70" : "text-red-500/80"} />
                  ) : (
                    <img
                      src="/assets/icons/mic_dark.png"
                      alt="Microphone"
                      className="w-[17px] h-[17px] object-contain"
                      style={{ filter: (isDarkTheme ? "none" : "invert(1)") }}
                    />
                  )}
                </button>
              )}
              <button
                onClick={() => onSend(input)}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 hover:scale-105 active:scale-95"
                style={{
                  background: "#2563EB",
                  borderRadius: 10,
                }}
              >
                <img
                  src="/assets/icons/Frame_Dark.png"
                  alt="Send"
                  className="w-full h-full object-contain"
                />
              </button>
            </div>
          </motion.div>

          {/* Category pill buttons - single row, scrollable on small screens */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.28, ease: "easeOut" }}
            className="flex justify-center gap-2.5 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {options.map((opt, i) => {
              const card = WELCOME_CARDS.find((c) => c.label === opt) ?? WELCOME_CARDS[0];
              const { Icon } = card;
              return (
                <motion.button
                  key={opt}
                  type="button"
                  onClick={() => onOptionClick(opt)}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.22 + i * 0.04, duration: 0.22 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  className={`flex items-center gap-2 rounded-[8px] text-[12px] sm:text-[13px] font-medium transition-colors whitespace-nowrap flex-shrink-0 
                    ${isDarkTheme ? "bg-white/5 text-white/50" : "bg-gray-500/5  text-gray-500"}`}
                  style={{

                    padding: "8px 14px",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: card.iconBg, color: card.iconColor }}
                  >
                    <Icon size={12} />
                  </div>
                  {opt}
                </motion.button>
              );
            })}
          </motion.div>
        </div>
        )}
      </div>
    </div>
  );
}



function MessageBubble({
  msg,
  onOptionClick,
  onSeeFlow,
  fullScreen,
  isDarkTheme,
  chatEnabled = true
}: {
  msg: ChatMessage;
  onOptionClick: (opt: string) => void;
  onSeeFlow?: () => void;
  fullScreen?: boolean;
  isDarkTheme?: boolean;
  chatEnabled?: boolean;
}) {
  const { brandName, brandLogoSrc } = useContext(BrandContext);
  const isUser = msg.role === "user";
  const isGreeting = msg.id === "greeting";

  /* FullScreen greeting in scroll (messages.length > 1): render as compact assistant message. */
  if (fullScreen && isGreeting && !isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex gap-2.5"
      >
        <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5">
          <img
            src={brandLogoSrc}
            alt={brandName}
            className="object-contain rounded-md"
            style={{ width: "23.27px", height: "28px" }}
          />
        </div>
        <div className="flex flex-col gap-1 items-start">
          <div
            className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed"
            style={{
              background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(26, 23, 23, 0.05)",
              color: isDarkTheme ? "rgba(255,255,255,0.85)" : "#0B0B0C",
              borderRadius: "16px 16px 16px 4px",
            }}
          >
            {formatMessage(msg.content, isDarkTheme ?? true)}
          </div>
          {msg.ts && (
            <span
              className="text-[12px] ml-1 mt-0.5"
              style={{
                color: isDarkTheme ? "rgba(255,255,255,0.6)" : "#0B0B0C",
                display: "block",
              }}
            >
              {formatTime(msg.ts)}
            </span>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {!isUser && (
        <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5">
          <img
            src={brandLogoSrc}
            alt={brandName}
            className="object-contain rounded-md"
            style={{ width: "23.27px", height: "28px" }}
          />
        </div>
      )}

      <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"} max-w-[88%]`}>
        {/* Text bubble */}
        <div
          className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed"
          style={
            isUser
              ? {
                background: "#2563EB",
                color: "#fff",
                borderRadius: "16px 16px 4px 16px",
                // boxShadow: "0 4px 14px rgba(37,99,235,0.32)",
              }
              : {
                background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                color: isDarkTheme ? "rgba(255,255,255,0.85)" : "#0B0B0C",
                borderRadius: "16px 16px 16px 4px",
              }
          }
        >
          {formatMessage(msg.content, isDarkTheme ?? true)}
        </div>
        {/* Timestamp */}
        {msg.ts && (
          <span
            className="text-[12px] px-1 mt-0.5"
            style={{
              color: isDarkTheme ? "rgba(255,255,255,0.6)" : "#0B0B0C",
              display: "block",
            }}
          >
            {formatTime(msg.ts)}
          </span>
        )}

        {/* Option chips (or cards when fullScreen); aligned and not clipped at top */}
        {chatEnabled && !isUser && msg.options && msg.options.length > 0 && !(fullScreen && isGreeting) && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.25 }}
            className={`flex flex-wrap gap-2 pl-0 max-w-full ${fullScreen ? "items-start" : ""}`}
          >
            {msg.options.map((opt, i) => (
              <motion.button
                key={opt}
                onClick={() => onOptionClick(opt)}
                initial={fullScreen ? { opacity: 0, scale: 0.95 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: fullScreen ? i * 0.04 : 0, duration: 0.2 }}
                whileHover={{ scale: fullScreen ? 1.03 : 1.05, y: fullScreen ? -1 : 0 }}
                whileTap={{ scale: 0.95 }}
                className={
                  fullScreen
                    ? "px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all text-left flex items-center gap-2 border border-white/10 hover:border-violet-500/30 shrink-0"
                    : "px-3 py-1.5 rounded-full text-[11px] font-medium transition-all text-left shrink-0"
                }
                style={
                  fullScreen
                    ? { background: "rgba(124,58,237,0.1)", color: isDarkTheme ?"#c4b5fd" :"rgb(114 99 172)"}
                    : {
                      background: "rgba(124,58,237,0.12)",
                      border: "1px solid rgba(124,58,237,0.3)",
                      color: "#c4b5fd",
                    }
                }
              >
                {opt}
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* Plan card (only for assistant) */}
        {!isUser && msg.plan && <PlanCard plan={msg.plan} onSeeFlow={onSeeFlow} isDarkTheme={isDarkTheme} />}

        {/* SRS document card — shown after discovery call */}
        {!isUser && msg.callSrs && <SRSCard srs={msg.callSrs} isDarkTheme={isDarkTheme} />}

        {/* Call summary transcript card */}
        {!isUser && msg.callSummary && msg.callSummary.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl overflow-hidden w-full mt-1"
            style={{ 
              background: isDarkTheme ? "rgba(10,8,24,0.95)" : "#ffffff",
              border: "1px solid rgba(124,58,237,0.2)" 
            }}
          >
            <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${isDarkTheme ? "border-white/[0.06]" : "border-[rgba(0,0,0,0.08)]"}`}>
              <Phone size={11} className={isDarkTheme ? "text-violet-400" : "text-violet-600"} />
              <span className={`text-[11px] font-bold ${isDarkTheme ? "text-white" : "text-[#0B0B0C]"}`}>Call transcript</span>
              <span className={`ml-auto text-[10px] ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>{msg.callSummary.length} exchanges</span>
            </div>
            <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {msg.callSummary.map((entry) => (
                <div key={entry.id} className={`flex ${entry.speaker === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-[11px] leading-relaxed"
                    style={
                      entry.speaker === "user"
                        ? { 
                          background: isDarkTheme ? "rgba(124,58,237,0.22)" : "rgba(124,58,237,0.15)",
                          color: isDarkTheme ? "#c4b5fd" : "#7c3aed",
                          borderRadius: "12px 12px 4px 12px" 
                        }
                        : {
                          background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                          color: isDarkTheme ? "rgba(255,255,255,0.7)" : "#0B0B0C",
                          borderRadius: "12px 12px 12px 4px",
                        }
                    }
                  >
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider block mb-0.5"
                      style={{ 
                        color: entry.speaker === "user" 
                          ? (isDarkTheme ? "#a78bfa" : "#7c3aed")
                          : (isDarkTheme ? "#06B6D4" : "#0891b2")
                      }}
                    >
                      {entry.speaker === "ai" ? `Alex · ${brandName}` : "You"}
                    </span>
                    {entry.text}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Call Agent: Duration Timer ──────────────────────────────────────────────

function CallDuration({ running }: { running: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span className="text-[11px] font-mono text-white/35">
      {mm}:{ss}
    </span>
  );
}

// ─── Call Agent: Overlay component ───────────────────────────────────────────

const SRS_AREA_LABELS: Record<string, string> = {
  BUSINESS_GOAL: "Business Goal",
  CORE_FEATURES: "Core Features",
  INTEGRATIONS: "Platform & Integrations",
  TIMELINE: "Timeline",
  BUDGET_TEAM: "Budget & Team",
  ANYTHING_ELSE: "Extra Details",
  // legacy / extended area names — kept for backward compat
  TARGET_USERS: "Target Users",
  USER_WORKFLOWS: "User Workflows",
  KEY_DATA: "Key Data",
  PLATFORM: "Platform",
  PERFORMANCE: "Performance",
  COMPLIANCE: "Compliance",
  EXISTING_SYSTEMS: "Existing Systems",
  DATA_REQUIREMENTS: "Key Data",
  NON_FUNCTIONAL: "Performance",
  SECURITY_COMPLIANCE: "Compliance",
  TECH_CONSTRAINTS: "Existing Systems",
};
const SRS_TOTAL_AREAS = 6;

function CallAgentOverlay({
  chatMessages,
  plan,
  onEnd,
  languageHint = "",
  srsEnabled = false,
  isDarkTheme = true,
}: {
  chatMessages: ChatMessage[];
  plan: ProjectPlan | null;
  onEnd: (transcript: CallEntry[]) => void;
  languageHint?: string;
  srsEnabled?: boolean;
  isDarkTheme?: boolean;
}) {
  const { brandName } = useContext(BrandContext);
  const [status, setStatus] = useState<CallStatus>("ringing");
  const [transcript, setTranscript] = useState<CallEntry[]>([]);
  const [interim, setInterim] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [hasSpeechAPI, setHasSpeechAPI] = useState(true);
  const [micDenied, setMicDenied] = useState(false);
  const [micErrorMsg, setMicErrorMsg] = useState<string>("");
  const [textInput, setTextInput] = useState("");
  const [coveredAreas, setCoveredAreas] = useState<string[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rAFRef = useRef<number>(0);
  const initGreetingAbortRef = useRef<AbortController | null>(null);
  const callHistoryRef = useRef<CallEntry[]>([]);
  const statusRef = useRef<string>("ringing");
  const isMutedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const callLocale =
    typeof navigator !== "undefined" ? navigator.language || navigator.languages?.[0] || "en-US" : "en-US";
  const callLanguageHint =
    languageHint.trim() ||
    chatMessages.filter((m) => m.role === "user").slice(-1)[0]?.content ||
    "";

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, interim]);

  const addEntry = useCallback((entry: CallEntry) => {
    setTranscript((prev) => {
      const updated = [...prev, entry];
      callHistoryRef.current = updated;
      return updated;
    });
  }, []);

  const stopListening = useCallback(() => {
    cancelAnimationFrame(rAFRef.current);
    try {
      mediaRecorderRef.current?.stop();
    } catch { }
    try {
      audioContextRef.current?.close();
    } catch { }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    audioContextRef.current = null;
    setInterim("");
  }, []);

  const speak = useCallback(
    (text: string): Promise<void> => {
      if (statusRef.current === "ended") return Promise.resolve();

      ttsAbortRef.current?.abort();
      const controller = new AbortController();
      ttsAbortRef.current = controller;

      const cleanText = prepareForSpeechExport(text);
      if (!cleanText) return Promise.resolve();

      const segments = cleanText
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const parts = segments.length > 0 ? segments : [cleanText];

      const runChunked = async (): Promise<boolean> => {
        let anyPlayed = false;
        let prefetched: Promise<ArrayBuffer | null> | null = null;
        for (let i = 0; i < parts.length; i++) {
          if (controller.signal.aborted || statusRef.current === "ended") return anyPlayed;
          const buffer = prefetched ? await prefetched : await fetchTTSAsArrayBuffer(parts[i], callLocale, controller.signal);
          prefetched = i + 1 < parts.length ? fetchTTSAsArrayBuffer(parts[i + 1], callLocale, controller.signal) : null;
          if (!buffer) return anyPlayed;
          const played = await new Promise<boolean>((resolve) => {
            playTTSFromArrayBuffer(buffer, {
              signal: controller.signal,
              sourceRef: ttsSourceRef,
              onEnd: () => resolve(true),
            }).then((p) => {
              if (!p) resolve(false);
            });
          });
          if (played) anyPlayed = true;
          if (!played) return anyPlayed;
        }
        return anyPlayed;
      };

      return new Promise((resolve) => {
        const onDone = () => {
          ttsAbortRef.current = null;
          resolve();
        };

        runChunked().then((didPlay) => {
          if (controller.signal.aborted || statusRef.current === "ended") {
            onDone();
            return;
          }
          if (didPlay) {
            onDone();
            return;
          }
          if (!window.speechSynthesis) {
            onDone();
            return;
          }
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(cleanText);
          const voices = window.speechSynthesis.getVoices();
          const preferred =
            voices.find((v) => v.name.includes("Samantha")) ||
            voices.find((v) => v.name.includes("Google UK English Female")) ||
            voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ||
            voices.find((v) => v.lang.startsWith("en-")) ||
            voices[0];
          if (preferred) utter.voice = preferred;
          utter.rate = 0.92;
          utter.pitch = 1.05;
          utter.volume = 1;
          utter.onend = onDone;
          utter.onerror = onDone;
          window.speechSynthesis.speak(utter);
        });
      });
    },
    [callLocale],
  );

  const startListening = useCallback(async () => {
    if (statusRef.current !== "active" || isMutedRef.current) return;

    // Unlock TTS AudioContext when starting mic (e.g. on unmute) so first-time AI speech can play
    unlockAudioContext();

    // Acquire microphone
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      const name: string = err?.name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicDenied(true);
        setMicErrorMsg("Access denied. Click the lock icon in the address bar → allow Microphone → refresh.");
      } else if (name === "NotFoundError") {
        setMicErrorMsg("No microphone detected on this device.");
      } else if (name === "SecurityError") {
        setMicErrorMsg("Blocked by security policy — try opening over HTTPS.");
      } else {
        setMicErrorMsg(`Microphone error: ${err?.message || name}`);
      }
      setHasSpeechAPI(false);
      return;
    }

    streamRef.current = stream;
    const chunks: Blob[] = [];

    // Pick best supported mime type for Whisper
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      // Release mic immediately after stopping
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (chunks.length === 0 || statusRef.current !== "active") {
        setInterim("");
        return;
      }

      setInterim("Transcribing…");
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const res = await fetch(`${API_BASE}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, mimeType, locale: callLocale }),
        });
        const data = await res.json();
        const text = (data.text || "").trim();
        setInterim("");
        if (text && statusRef.current === "active") {
          sendToAI(text);
        } else if (statusRef.current === "active") {
          // No speech detected — restart listening
          startListening();
        }
      } catch {
        setInterim("");
        if (statusRef.current === "active") startListening();
      }
    };

    // ── Silence detection via AudioContext ──────────────────────────────────
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    recorder.start();
    setInterim("Listening…");

    let hasSpeech = false;
    let speechStartTime = 0;
    let silenceStart = 0;
    const SPEECH_THRESHOLD = 4; // RMS > this = speech detected
    const MIN_SPEECH_MS = 400; // ignore blips shorter than this
    const SILENCE_MS = 1500; // ms of quiet after speech → stop

    const checkAudio = () => {
      if (statusRef.current !== "active" || isMutedRef.current) {
        cancelAnimationFrame(rAFRef.current);
        try {
          audioCtx.close();
        } catch { }
        if (recorder.state === "recording") recorder.stop();
        return;
      }
      analyser.getByteTimeDomainData(dataArray);
      const rms = Math.sqrt(dataArray.reduce((s, v) => s + (v - 128) ** 2, 0) / dataArray.length);
      const now = Date.now();

      if (rms > SPEECH_THRESHOLD) {
        if (!hasSpeech) {
          hasSpeech = true;
          speechStartTime = now;
        }
        silenceStart = 0;
        setInterim("Recording…");
      } else if (hasSpeech) {
        if (!silenceStart) silenceStart = now;
        if (now - speechStartTime > MIN_SPEECH_MS && now - silenceStart > SILENCE_MS) {
          cancelAnimationFrame(rAFRef.current);
          try {
            audioCtx.close();
          } catch { }
          recorder.stop();
          return;
        }
      }
      rAFRef.current = requestAnimationFrame(checkAudio);
    };
    rAFRef.current = requestAnimationFrame(checkAudio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendToAI = useCallback(
    async (userText: string) => {
      if (!userText.trim()) {
        startListening();
        return;
      }
      setInterim("");
      setStatus("thinking");
      statusRef.current = "thinking";

      const userEntry: CallEntry = { speaker: "user", text: userText.trim(), id: `u-${Date.now()}` };
      addEntry(userEntry);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const chatCtx = chatMessages
          .filter((m) => m.id !== "greeting" && !m.flowMessage && !m.callSummary)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch(`${API_BASE}/api/call-agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userText.trim(),
            callHistory: callHistoryRef.current.map((h) => ({ speaker: h.speaker, text: h.text })),
            chatMessages: chatCtx,
            plan,
            languageHint: callLanguageHint,
          }),
          signal: controller.signal,
        });

        if (statusRef.current === "ended") return;

        const data = await res.json();
        const responseText = data.response || "Tell me more about that.";
        const isComplete = Boolean(data.isCallComplete);
        if (Array.isArray(data.coveredAreas) && data.coveredAreas.length > 0) {
          setCoveredAreas((prev) => {
            const merged = Array.from(new Set([...prev, ...data.coveredAreas]));
            return merged;
          });
        }

        const aiEntry: CallEntry = { speaker: "ai", text: responseText, id: `a-${Date.now()}` };
        addEntry(aiEntry);

        if (statusRef.current === "ended") return;

        setStatus("speaking");
        statusRef.current = "speaking";
        await speak(responseText);

        if (statusRef.current === "ended") return;

        if (isComplete) {
          setStatus("ended");
          statusRef.current = "ended";
          setTimeout(() => onEnd(callHistoryRef.current), 600);
        } else {
          setStatus("active");
          statusRef.current = "active";
          if (!isMutedRef.current) startListening();
        }
      } catch (err: any) {
        if (err?.name === "AbortError" || statusRef.current === "ended") return;
        console.error("[CallAgent] sendToAI error:", err);
        const fallback = "Sorry, brief connection issue — please go ahead.";
        addEntry({ speaker: "ai", text: fallback, id: `a-err-${Date.now()}` });
        if (statusRef.current === "ended") return;
        setStatus("speaking");
        statusRef.current = "speaking";
        await speak(fallback);
        if (statusRef.current === "ended") return;
        setStatus("active");
        statusRef.current = "active";
        if (!isMutedRef.current) startListening();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [chatMessages, plan, speak, addEntry, startListening],
  );

  // Start call on mount
  useEffect(() => {
    // MediaRecorder is available in all modern browsers — no API check needed.
    // Pre-check mic permission to show the right UI before getUserMedia is called.
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((perm) => {
          if (perm.state === "denied") {
            setHasSpeechAPI(false);
            setMicDenied(true);
            setMicErrorMsg(
              "Microphone is blocked in browser settings. Click the lock icon in the address bar → allow Microphone → refresh.",
            );
          }
        })
        .catch(() => {
          /* permissions API unavailable — getUserMedia will handle it */
        });
    }

    // Minimal delay so first speech starts quickly (short greeting = faster TTS)
    const t = setTimeout(async () => {
      unlockAudioContext();
      initGreetingAbortRef.current?.abort();
      const controller = new AbortController();
      initGreetingAbortRef.current = controller;
      try {
        const chatCtx = chatMessages
          .filter((m) => m.id !== "greeting" && !m.flowMessage && !m.callSummary)
          .map((m) => ({ role: m.role, content: m.content }));
        const res = await fetch(`${API_BASE}/api/call-agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Begin the discovery call now with a short greeting and the first question.",
            callHistory: [],
            chatMessages: chatCtx,
            plan,
            languageHint: callLanguageHint,
          }),
          signal: controller.signal,
        });
        if (controller.signal.aborted || statusRef.current === "ended") return;
        const data = await res.json();
        const greeting = data.response || "Hello. What problem is your product solving, and who is it for?";
        addEntry({ speaker: "ai", text: greeting, id: `a-greet-${Date.now()}` });
        setStatus("speaking");
        statusRef.current = "speaking";
        await speak(greeting);
        if (controller.signal.aborted || statusRef.current === "ended") return;
        setStatus("active");
        statusRef.current = "active";
        if (!isMutedRef.current) startListening();
      } catch (err: any) {
        if (err?.name === "AbortError" || controller.signal.aborted || statusRef.current === "ended") return;
        const fallback = "Hello. What problem is your product solving, and who is it for?";
        addEntry({ speaker: "ai", text: fallback, id: `a-greet-${Date.now()}` });
        setStatus("speaking");
        statusRef.current = "speaking";
        await speak(fallback);
        setStatus("active");
        statusRef.current = "active";
        if (!isMutedRef.current) startListening();
      }
    }, 100);

    return () => {
      clearTimeout(t);
      initGreetingAbortRef.current?.abort();
      initGreetingAbortRef.current = null;
      abortRef.current?.abort();
      ttsAbortRef.current?.abort();
      if (ttsSourceRef.current) {
        try {
          ttsSourceRef.current.stop();
        } catch { }
      }
      cancelAnimationFrame(rAFRef.current);
      try {
        mediaRecorderRef.current?.stop();
      } catch { }
      try {
        audioContextRef.current?.close();
      } catch { }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      window.speechSynthesis?.cancel();
      statusRef.current = "ended";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callLanguageHint, chatMessages, plan, speak, startListening]);

  const handleEnd = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (ttsSourceRef.current) {
      try {
        ttsSourceRef.current.stop();
      } catch { }
      ttsSourceRef.current = null;
    }
    stopListening();
    window.speechSynthesis?.cancel();
    setStatus("ended");
    statusRef.current = "ended";
    setTimeout(() => onEnd(callHistoryRef.current), 350);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    if (next) {
      stopListening();
      setInterim("");
    } else {
      // Unlock TTS AudioContext on unmute (user gesture) so AI speech plays without needing a second click
      unlockAudioContext();
      if (statusRef.current === "active") startListening();
    }
  };

  // startListening now calls getUserMedia internally and sets micDenied/micErrorMsg on failure.
  // This button just resets state and retries — no need to duplicate getUserMedia logic here.
  const requestMicPermission = useCallback(() => {
    setMicDenied(false);
    setMicErrorMsg("");
    setHasSpeechAPI(true);
    if (statusRef.current === "active") startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startListening]);

  const handleTextSend = useCallback(() => {
    const text = textInput.trim();
    if (!text || status === "thinking" || status === "speaking" || status === "ended") return;
    setTextInput("");
    sendToAI(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput, status, sendToAI]);

  const STATUS_LABEL: Record<CallStatus, string> = {
    ringing: "Connecting…",
    active: hasSpeechAPI ? "Listening…" : "Ready",
    thinking: "Thinking…",
    speaking: "Speaking…",
    ended: "Call ended",
  };
  const STATUS_COLOR: Record<CallStatus, string> = {
    ringing: "#a78bfa",
    active: "#10B981",
    thinking: "#f59e0b",
    speaking: "#06B6D4",
    ended: "rgba(255,255,255,0.3)",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl"
      style={{
        background: isDarkTheme ? "rgba(8,6,20,0.99)" : "#ffffff",
        border: "1px solid rgba(124,58,237,0.28)",
        boxShadow: isDarkTheme 
          ? "0 8px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.08)"
          : "0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(124,58,237,0.15)",
        margin: "0 0 4px",
      }}
    >
      {/* ── Header ─────────────────────────── */}
      <div
        className="px-5 py-4 flex items-center gap-3.5 flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(109,40,217,0.06))",
          borderBottom: "1px solid rgba(124,58,237,0.18)",
        }}
      >
        {/* Animated avatar */}
        <div className="relative flex-shrink-0">
          {(status === "ringing" || status === "speaking") && (
            <>
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: "rgba(124,58,237,0.35)" }}
                animate={{ scale: [1, 1.7], opacity: [0.55, 0] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: "rgba(124,58,237,0.2)" }}
                animate={{ scale: [1, 2.2], opacity: [0.35, 0] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut", delay: 0.45 }}
              />
            </>
          )}
          {status === "active" && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: "rgba(16,185,129,0.45)" }}
              animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base relative z-10 select-none"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
              boxShadow: "0 0 22px rgba(124,58,237,0.5)",
            }}
          >
            A
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold leading-tight ${isDarkTheme ? "text-white" : "text-[#0B0B0C]"}`}>
            Alex · {brandName} {srsEnabled ? "SRS Discovery" : "Discovery"}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <motion.span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: STATUS_COLOR[status] }}
              animate={status !== "ended" ? { opacity: [1, 0.25, 1] } : {}}
              transition={{ duration: 1.1, repeat: Infinity }}
            />
            <span className="text-[11px] font-medium" style={{ color: STATUS_COLOR[status] }}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <CallDuration running={status !== "ringing" && status !== "ended"} />
          {/* Discovery progress pill */}
          <div className="flex items-center gap-1">
            <span className={`text-[9px] font-mono ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>
              {coveredAreas.length}/{SRS_TOTAL_AREAS}
            </span>
            <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: isDarkTheme ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #7c3aed, #10B981)" }}
                animate={{ width: `${(coveredAreas.length / SRS_TOTAL_AREAS) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Transcript ─────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0">
        {transcript.length === 0 && status === "ringing" && (
          <div className={`flex items-center justify-center h-full gap-2 text-sm ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}>
            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.3, repeat: Infinity }}>
              ●
            </motion.span>
            <motion.span
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.3, repeat: Infinity, delay: 0.2 }}
            >
              ●
            </motion.span>
            <motion.span
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.3, repeat: Infinity, delay: 0.4 }}
            >
              ●
            </motion.span>
          </div>
        )}

        {transcript.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className={`flex ${entry.speaker === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[80%] px-3.5 py-2.5 text-[12px] leading-relaxed"
              style={
                entry.speaker === "user"
                  ? {
                    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                    color: "#fff",
                    borderRadius: "14px 14px 4px 14px",
                    boxShadow: "0 2px 10px rgba(124,58,237,0.3)",
                  }
                  : {
                    background: isDarkTheme ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                    border: isDarkTheme ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(0,0,0,0.08)",
                    color: isDarkTheme ? "rgba(255,255,255,0.85)" : "#0B0B0C",
                    borderRadius: "14px 14px 14px 4px",
                  }
              }
            >
              <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 opacity-60">
                {entry.speaker === "ai" ? "Alex" : "You"}
              </span>
              {entry.text}
            </div>
          </motion.div>
        ))}

        {/* Live interim caption */}
        {interim && status === "active" && (
          <div className="flex justify-end">
            <div
              className="max-w-[80%] px-3.5 py-2.5 text-[12px] leading-relaxed italic"
              style={{
                background: isDarkTheme ? "rgba(124,58,237,0.15)" : "rgba(124,58,237,0.1)",
                border: "1px solid rgba(124,58,237,0.3)",
                color: isDarkTheme ? "rgba(255,255,255,0.5)" : "rgba(124,58,237,0.8)",
                borderRadius: "14px 14px 4px 14px",
              }}
            >
              <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 opacity-50">You (live)</span>
              {interim}
            </div>
          </div>
        )}

        {/* Thinking dots */}
        {status === "thinking" && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3"
              style={{
                background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                border: isDarkTheme ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                borderRadius: "14px 14px 14px 4px",
              }}
            >
              <div className="flex gap-1.5 items-center">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          </div>
        )}

        {/* Covered areas chips */}
        {coveredAreas.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1 py-1 flex flex-wrap gap-1">
            {coveredAreas.map((area) => (
              <span
                key={area}
                className="px-2 py-0.5 rounded-md text-[9px] font-semibold"
                style={{
                  background: "rgba(16,185,129,0.12)",
                  border: "1px solid rgba(16,185,129,0.25)",
                  color: "#6ee7b7",
                }}
              >
                ✓ {SRS_AREA_LABELS[area] || area}
              </span>
            ))}
          </motion.div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* ── Controls ───────────────────────── */}
      <div className={`border-t flex-shrink-0 ${isDarkTheme ? "border-white/[0.06]" : "border-[rgba(0,0,0,0.08)]"}`}>
        {/* Text input fallback — shown when mic is unavailable */}
        {!hasSpeechAPI && (
          <div className="px-4 pt-3 pb-2">
            {/* Status banner */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(245,158,11,0.12)",
                  color: "#fcd34d",
                  border: "1px solid rgba(245,158,11,0.25)",
                }}
              >
                {micDenied ? "Mic permission denied" : "Mic not supported"}
              </span>
              {micDenied ? (
                <button
                  type="button"
                  onClick={requestMicPermission}
                  className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors underline"
                >
                  Grant access
                </button>
              ) : (
                <span className={`text-[10px] ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>Switch to Chrome or Edge to use your mic</span>
              )}
            </div>
            {micErrorMsg && (
              <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "rgba(252,211,77,0.8)" }}>
                {micErrorMsg}
              </p>
            )}
            {/* Type-your-response input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
                placeholder="Type your response and press Enter…"
                disabled={status === "thinking" || status === "speaking" || status === "ended"}
                className={`flex-1 text-[12px] outline-none disabled:opacity-40 ${isDarkTheme ? "text-white placeholder:text-white/25" : "text-[#0B0B0C] placeholder:text-[rgba(11,11,12,0.4)]"}`}
                style={{
                  background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                  border: isDarkTheme ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
                  borderRadius: "12px",
                  padding: "8px 14px",
                }}
              />
              <button
                type="button"
                onClick={handleTextSend}
                disabled={!textInput.trim() || status === "thinking" || status === "speaking" || status === "ended"}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 disabled:opacity-35"
                style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}
              >
                <Send size={13} className="text-white" />
              </button>
            </div>
          </div>
        )}

        {/* Button row */}
        <div className="px-5 py-3 flex items-center gap-4">
          <div className="flex-1" />

          {/* Mute button — only when mic is available */}
          {hasSpeechAPI && (
            <button
              type="button"
              onClick={handleToggleMute}
              disabled={status === "ringing" || status === "ended"}
              title={isMuted ? "Unmute" : "Mute"}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-35"
              style={{
                background: isMuted ? "rgba(239,68,68,0.18)" : (isDarkTheme ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"),
                border: `1px solid ${isMuted ? "rgba(239,68,68,0.4)" : (isDarkTheme ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.1)")}`,
              }}
            >
              {isMuted ? <MicOff size={15} className="text-red-400" /> : <Mic size={15} className={isDarkTheme ? "text-white/55" : "text-[rgba(11,11,12,0.6)]"} />}
            </button>
          )}

          {/* Status pulse */}
          <div className="text-center">
            <motion.div
              className="w-2 h-2 rounded-full mx-auto"
              style={{ background: STATUS_COLOR[status] }}
              animate={status !== "ended" ? { scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] } : {}}
              transition={{ duration: 1.1, repeat: Infinity }}
            />
          </div>

          {/* End call */}
          <button
            type="button"
            onClick={handleEnd}
            disabled={status === "ended"}
            title="End call"
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-35"
            style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.38)" }}
          >
            <PhoneOff size={15} className="text-red-400" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Flow Chat Bubble ─────────────────────────────────────────────────────────

function FlowChatBubble({
  flowAgentLoading,
  flowAgentResult,
  flowAgentImages,
  flowAgentImagesLoading,
  onRunFlowAgent,
  onRunFlowAgentImages,
  onClose,
}: {
  flowAgentLoading: boolean;
  flowAgentResult: {
    frd: string;
    designs: Array<{ title?: string; description?: string; keyScreens?: string[] }>;
  } | null;
  flowAgentImages: Array<{ index: number; dataUrl?: string; error?: string }>;
  flowAgentImagesLoading: boolean;
  onRunFlowAgent: () => void;
  onRunFlowAgentImages: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex gap-2.5"
    >
      {/* Bot avatar */}
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-violet-900/40">
        <Zap size={11} className="text-white" fill="white" />
      </div>

      {/* Chat bubble container */}
      <div
        className="flex-1 min-w-0 overflow-hidden"
        style={{
          background: "rgba(18,18,42,0.98)",
          border: "1px solid rgba(124,58,237,0.25)",
          borderRadius: "16px 16px 16px 4px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-violet-400" />
            <h3 className="text-sm font-bold text-white">Design flow & AI agent</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Generate with AI card */}
          <div
            className="rounded-xl p-4 border border-violet-500/25 flex flex-col gap-3"
            style={{ background: "rgba(124,58,237,0.08)" }}
          >
            <p className="text-[12px] font-medium text-white">Generate with AI</p>
            <p className="text-[11px] text-white/50">
              Create a simple FRD and 4–5 design concepts from this conversation.
            </p>
            <button
              type="button"
              onClick={onRunFlowAgent}
              disabled={flowAgentLoading}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[12px] font-semibold text-white transition-all disabled:opacity-60 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                boxShadow: "0 0 20px rgba(124,58,237,0.35)",
              }}
            >
              {flowAgentLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Generating FRD & designs…
                </>
              ) : (
                <>
                  <Zap size={13} fill="white" />
                  Generate FRD & 4–5 designs
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {flowAgentResult && (
            <div className="space-y-4">
              {flowAgentResult.frd && (
                <div
                  className="rounded-xl p-4"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <h4 className="text-[11px] font-bold text-violet-300 uppercase tracking-wider mb-2">
                    Functional Requirements (FRD)
                  </h4>
                  <div className="text-[11px] text-white/85 whitespace-pre-wrap leading-relaxed">
                    {flowAgentResult.frd}
                  </div>
                </div>
              )}
              {flowAgentResult.designs && flowAgentResult.designs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-[11px] font-bold text-violet-300 uppercase tracking-wider">
                      Design concepts (4–5)
                    </h4>
                    <button
                      type="button"
                      onClick={onRunFlowAgentImages}
                      disabled={flowAgentImagesLoading}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors"
                    >
                      {flowAgentImagesLoading ? (
                        <>
                          <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Generating…
                        </>
                      ) : flowAgentImages.some((img) => img.dataUrl) ? (
                        "Regenerate mockups"
                      ) : (
                        "Show real design mockups"
                      )}
                    </button>
                  </div>
                  <div className="grid gap-2">
                    {flowAgentResult.designs.map((d, i) => {
                      const img = flowAgentImages.find((x) => x.index === i);
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="rounded-xl overflow-hidden"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                          <div className="p-3 flex gap-2 flex-wrap">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
                            >
                              {i + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-semibold text-white mb-0.5">
                                {d.title || `Design ${i + 1}`}
                              </p>
                              <p className="text-[10px] text-white/55 leading-relaxed">{d.description || ""}</p>
                              {d.keyScreens && d.keyScreens.length > 0 && (
                                <p className="text-[9px] text-white/40 mt-1">Screens: {d.keyScreens.join(" → ")}</p>
                              )}
                            </div>
                          </div>
                          {img?.dataUrl && (
                            <div className="border-t border-white/[0.08] p-2 bg-black/20">
                              <img
                                src={img.dataUrl}
                                alt={d.title || `Design ${i + 1}`}
                                className="w-full rounded-lg object-contain max-h-48 bg-white/5"
                              />
                            </div>
                          )}
                          {flowAgentImagesLoading && !img?.dataUrl && !img?.error && (
                            <div className="border-t border-white/[0.08] p-4 flex items-center justify-center gap-2 text-white/40 text-[11px]">
                              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Generating mockup…
                            </div>
                          )}
                          {img?.error && (
                            <div className="border-t border-white/[0.08] p-2 text-[10px] text-amber-400/90">
                              {img.error}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                  {flowAgentImages.some((x) => x.error) &&
                    flowAgentImages.length > 0 &&
                    !flowAgentImages.some((x) => x.dataUrl) && (
                      <p className="text-[10px] text-white/45 mt-1">
                        Add OPENAI_API_KEY to .env for AI-generated design mockups.
                      </p>
                    )}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-white/[0.08] pt-3 space-y-3">
            <p className="text-[11px] text-white/45">
              We also create 3–4 strong design pages and walk you through the flow on a call.
            </p>
            <a
              href="https://theninehertz.com/case-studies"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium text-violet-300 hover:text-violet-200 transition-colors"
              style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}
            >
              <ExternalLink size={11} />
              View example screens from past projects
            </a>
            {DESIGN_FLOW_PAGES.map((page) => (
              <div
                key={page.step}
                className="rounded-xl p-3 flex gap-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
                >
                  {page.step}
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12px] font-semibold text-white mb-0.5">{page.title}</h4>
                  <p className="text-[10px] text-white/45 leading-relaxed">{page.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main ChatBot Component ───────────────────────────────────────────────────

interface Props {
  fullScreen?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onChatActive?: (active: boolean) => void;
  isDarkTheme?: boolean;
}

export default function ChatBot({ fullScreen = false, isOpen = true, onClose, onChatActive, isDarkTheme = true }: Props) {
  const showChat = fullScreen || isOpen;

  // Feature gating + white-label brand (generated apps read `generator.config.json` via API)
  const [companyFeatureTags, setCompanyFeatureTags] = useState<string[] | null>(null);
  const [brandConfig, setBrandConfig] = useState<BrandContextValue>(() => ({ ...DEFAULT_BRAND }));
  useEffect(() => {
    let cancelled = false;
    if (!showChat) return;

    async function loadGeneratorConfig() {
      try {
        const res = await fetch(`${API_BASE}/api/generator-config`, { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        const tags = Array.isArray(data?.companyFeatures) ? data.companyFeatures : null;
        const name =
          typeof data?.companyName === "string" && data.companyName.trim()
            ? data.companyName.trim()
            : DEFAULT_BRAND.brandName;
        const logo =
          typeof data?.companyLogoUrl === "string" && data.companyLogoUrl.trim()
            ? data.companyLogoUrl.trim()
            : DEFAULT_BRAND.brandLogoSrc;
        const site =
          typeof data?.companyWebsiteUrl === "string" && data.companyWebsiteUrl.trim()
            ? data.companyWebsiteUrl.trim()
            : DEFAULT_BRAND.companyWebsiteUrl;
        if (!cancelled) {
          setCompanyFeatureTags(tags);
          setBrandConfig({ brandName: name, brandLogoSrc: logo, companyWebsiteUrl: site });
        }
      } catch {
        // If generator config is missing, keep defaults below.
      }
    }

    loadGeneratorConfig();
    return () => {
      cancelled = true;
    };
  }, [showChat]);

  // Safe fallback: if config fetch fails, default to `chat` only.
  // This prevents unwanted SRS / Hindi / multiLanguage content from showing.
  const normalizedFeatureTagsLower = (companyFeatureTags ?? ["chat"])
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);

  const isChatEnabled = normalizedFeatureTagsLower.includes("chat");
  const isCallEnabled = normalizedFeatureTagsLower.includes("call");
  const isSrsEnabled = normalizedFeatureTagsLower.includes("srs");
  const isMultiLanguageEnabled = normalizedFeatureTagsLower.includes("multilanguage") && !isSrsEnabled;

  const [messages, setMessages] = useState<ChatMessage[]>([createDefaultGreeting()]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [questionNum, setQuestionNum] = useState(1);
  const [showCallAgent, setShowCallAgent] = useState(false);
  const [hasCallEnded, setHasCallEnded] = useState(false);
  const [flowAgentLoading, setFlowAgentLoading] = useState(false);
  const [flowAgentResult, setFlowAgentResult] = useState<{
    frd: string;
    designs: Array<{ title?: string; description?: string; keyScreens?: string[] }>;
  } | null>(null);
  const [flowAgentImagesLoading, setFlowAgentImagesLoading] = useState(false);
  const [flowAgentImages, setFlowAgentImages] = useState<Array<{ index: number; dataUrl?: string; error?: string }>>(
    [],
  );
  const [caseStudies, setCaseStudies] = useState<Array<{ title: string; url: string; imageUrl?: string | null }>>([]);
  const [caseStudiesLoading, setCaseStudiesLoading] = useState(false);
  // Only the single relevant case study (Empowering Financial Success through Automated Trading Software) is shown.
  const displayCaseStudies = useMemo(() => {
    const seen = new Set<string>();
    return caseStudies
      .filter((cs) => {
        const url = (cs.url || "").replace(/\/$/, "");
        if (!url || seen.has(url)) return false;
        const title = (cs.title || "").trim();
        if (!title || title.includes("<") || title.includes(">") || title.length > 250) return false;
        seen.add(url);
        return true;
      })
      // .slice(0, 1);
  }, [caseStudies]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Voice chat mode ────────────────────────────────────────────────────────
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const voiceModeRef = useRef(false);
  const voiceStartedFromClickRef = useRef(false);
  useEffect(() => {
    voiceModeRef.current = voiceModeActive;
  }, [voiceModeActive]);

  // Use a stable ref so useVoiceChat doesn't depend on sendMessage directly
  const sendMessageRef = useRef<(text: string) => void>(() => { });
  // Declare the callback BEFORE useVoiceChat so hook order stays stable across HMR updates
  const onVoiceTranscript = useCallback((text: string) => {
    sendMessageRef.current(text);
  }, []);
  const voice = useVoiceChat({ onTranscript: onVoiceTranscript });

  // Start/stop listening when voice mode toggles (including on welcome/landing screen)
  // When coming from welcome mic click we already started in startVoiceInput; skip so we don't restart
  useEffect(() => {
    if (voiceModeActive) {
      if (voiceStartedFromClickRef.current) {
        voiceStartedFromClickRef.current = false;
      } else {
        voice.startListening();
      }
    } else {
      voice.stopAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceModeActive]);

  // If chat is disabled, ensure voice-chat mode is fully turned off.
  useEffect(() => {
    if (!isChatEnabled && voiceModeActive) setVoiceModeActive(false);
  }, [isChatEnabled, voiceModeActive]);
  // When AI finishes responding in voice mode → speak the reply → then listen
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !loading && voiceModeRef.current) {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && last.content) {
        voice.speak(last.content, () => {
          if (voiceModeRef.current) voice.startListening();
        });
      }
    }
    prevLoadingRef.current = loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceModeActive((prev) => !prev);
  }, []);

  // Start voice from welcome/landing: must run in same user gesture as click (browser requirement)
  const startVoiceInput = useCallback(() => {
    if (!voice.isSupported) return;
    voiceStartedFromClickRef.current = true;
    unlockAudioContext();
    voice.startListening();
    setVoiceModeActive(true);
  }, [voice]);

  useEffect(() => {
    if (showChat) setTimeout(() => inputRef.current?.focus(), 350);
  }, [showChat]);

  // Set placeholder color for white theme
  useEffect(() => {
    if (inputRef.current) {
      if (!isDarkTheme) {
        inputRef.current.style.setProperty('--placeholder-color', 'rgba(11, 11, 12, 0.45)');
        const style = document.createElement('style');
        style.id = 'chatbot-input-placeholder';
        if (!document.getElementById('chatbot-input-placeholder')) {
          style.textContent = `input[data-chatbot-input]::placeholder { color: rgba(11, 11, 12, 0.45) !important; }`;
          document.head.appendChild(style);
        }
      } else {
        const style = document.getElementById('chatbot-input-placeholder');
        if (style) style.remove();
      }
    }
  }, [isDarkTheme]);

  useEffect(() => {
    onChatActive?.(messages.length > 1);
  }, [messages.length, onChatActive]);

  // Fetch NineHertz case studies that match the client idea (when we have conversation or plan)
  const hasPlan = messages.some((m) => m.plan);
  const planMsg = messages.find((m) => m.plan);
  useEffect(() => {
    if (!fullScreen || (messages.length <= 1 && !hasPlan)) return;
    let cancelled = false;
    setCaseStudiesLoading(true);
    const history = messages.filter((m) => m.id !== "greeting").map((m) => ({ role: m.role, content: m.content }));
    fetch(`${API_BASE}/api/case-studies/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, plan: planMsg?.plan ?? null }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.caseStudies)) setCaseStudies(data.caseStudies);
      })
      .catch(() => {
        if (!cancelled) setCaseStudies([]);
      })
      .finally(() => {
        if (!cancelled) setCaseStudiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fullScreen, messages.length, hasPlan]);

  // Track previous state to detect actual changes for scroll
  const prevMessageCountForScrollRef = useRef(messages.length);
  const prevLoadingForScrollRef = useRef(loading);

  // Scroll the messages container to bottom when messages/loading change (so latest message is visible)
  const scrollMessagesToBottom = useCallback((immediate = false) => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 0) {
      // Use scrollTop for immediate scroll, scrollTo for smooth
      if (immediate) {
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTo({ top: maxScroll, behavior: "smooth" });
      }
    }
  }, []);

  // After first selection and new messages: scroll to bottom so input stays visible and content is in view
  useEffect(() => {
    if (fullScreen && messages.length <= 1) return;
    
    const hasNewMessage = messages.length > prevMessageCountForScrollRef.current;
    const loadingStarted = !prevLoadingForScrollRef.current && loading;
    const loadingCompleted = prevLoadingForScrollRef.current && !loading;
    
    prevMessageCountForScrollRef.current = messages.length;
    prevLoadingForScrollRef.current = loading;
    
    // Scroll when:
    // 1. New message added
    // 2. Loading starts (to show typing indicator at bottom)
    // 3. Loading completes (to show new message)
    if (hasNewMessage || loadingStarted || loadingCompleted) {
      // Multiple attempts to ensure scroll happens after DOM updates
      scrollMessagesToBottom(true);
      const t1 = requestAnimationFrame(() => scrollMessagesToBottom(true));
      const t2 = setTimeout(() => scrollMessagesToBottom(true), 50);
      const t3 = setTimeout(() => scrollMessagesToBottom(true), 150);
      return () => {
        cancelAnimationFrame(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [messages.length, loading, fullScreen, scrollMessagesToBottom]);

  // When a plan appears, scroll again after layout so "See Flow" CTA is visible
  const lastMsg = messages[messages.length - 1];
  const lastHasPlan = lastMsg?.role === "assistant" && lastMsg?.plan;
  useEffect(() => {
    if (!lastHasPlan) return;
    const t = setTimeout(scrollMessagesToBottom, 200);
    return () => clearTimeout(t);
  }, [lastHasPlan, scrollMessagesToBottom]);

  const currentLanguageHintRef = useRef("");
  const greetingLocalizationSeqRef = useRef(0);
  const lastGreetingLocalizedHintRef = useRef("");
  const localizeUiText = useCallback(
    async (text: string, languageHintOverride?: string) => {
      const languageHint = languageHintOverride?.trim() || currentLanguageHintRef.current?.trim();
      if (!languageHint || !isMultiLanguageEnabled) return text;
      try {
        const res = await fetch(`${API_BASE}/api/localize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, languageHint }),
        });
        const data = await res.json();
        return (data?.text || text).trim();
      } catch {
        return text;
      }
    },
    [isMultiLanguageEnabled],
  );

  const localizeDefaultGreeting = useCallback(
    async (languageHint: string) => {
      const hint = languageHint.trim();
      if (!hint || hint === lastGreetingLocalizedHintRef.current) return;
      lastGreetingLocalizedHintRef.current = hint;
      const requestSeq = ++greetingLocalizationSeqRef.current;

      const [localizedGreeting, ...localizedOptions] = await Promise.all([
        localizeUiText("How can I help you today?", hint),
        ...DEFAULT_GREETING_OPTIONS.map((option) => localizeUiText(option, hint)),
      ]);

      if (requestSeq !== greetingLocalizationSeqRef.current) return;

      setMessages((prev) => {
        const greetingIndex = prev.findIndex((msg) => msg.id === "greeting");
        if (greetingIndex === -1) return prev;

        const next = [...prev];
        next[greetingIndex] = {
          ...next[greetingIndex],
          content: localizedGreeting || "How can I help you today?",
          options: localizedOptions.length ? localizedOptions : [...DEFAULT_GREETING_OPTIONS],
        };
        return next;
      });
    },
    [localizeUiText],
  );

  useEffect(() => {
    if (messages.length !== 1 || messages[0]?.id !== "greeting") return;
    const hint = input.trim();
    if (!hint) return;

    const timer = window.setTimeout(() => {
      void localizeDefaultGreeting(hint);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [input, messages, localizeDefaultGreeting]);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: { languageHint?: string; updateLanguageHint?: boolean },
    ) => {
      if (!isChatEnabled) return;
      if (!text.trim() || loading) return;
      const trimmedText = text.trim();
      const languageHint = options?.languageHint?.trim() || trimmedText;
      const updateLanguageHint = options?.updateLanguageHint !== false;

      const userMsg: ChatMessage = {
        role: "user",
        content: trimmedText,
        id: Date.now().toString(),
        ts: Date.now(),
      };
      if (updateLanguageHint && languageHint) {
        currentLanguageHintRef.current = languageHint;
        if (messages.length === 1 && messages[0]?.id === "greeting") {
          void localizeDefaultGreeting(languageHint);
        }
      }
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      
      // Immediately scroll to show user message
      setTimeout(() => {
        const el = messagesScrollRef.current;
        if (el) {
          const maxScroll = el.scrollHeight - el.clientHeight;
          if (maxScroll > 0) {
            el.scrollTo({ top: maxScroll, behavior: "auto" });
          }
        }
      }, 0);

      try {
        // Build history: exclude greeting as a message (it's system context)
        const history = [...messages, userMsg]
          .filter((m) => m.id !== "greeting")
          .map((m) => ({ role: m.role, content: m.content }));

        const useStream = true;
        const url = useStream ? `${API_BASE}/api/chat/stream` : `${API_BASE}/api/chat`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, languageHint }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let data: { message?: string; options?: string[] | null; plan?: ProjectPlan | null; questionNum?: number } | undefined;
        if (useStream && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const payload = JSON.parse(line.slice(6)) as { type: string; message?: string; options?: string[] | null; plan?: ProjectPlan | null; questionNum?: number };
                  if (payload.type === "done") {
                    data = { message: payload.message, options: payload.options ?? null, plan: payload.plan ?? null, questionNum: payload.questionNum };
                    break;
                  }
                  if (payload.type === "error") {
                    data = { message: payload.message || "Stream error" };
                    break;
                  }
                } catch {
                  /* ignore parse */
                }
              }
            }
            if (data) break;
          }
          if (!data) data = { message: "No response received." };
        } else {
          data = await res.json();
        }
        const responseData = data ?? { message: "No response received.", options: null, plan: null, questionNum: 0 };

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: responseData.message || "I'm thinking...",
          id: Date.now().toString() + "-a",
          ts: Date.now(),
          options: responseData.options ?? null,
          plan: responseData.plan ?? null,
          questionNum: responseData.questionNum ?? 0,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        if (typeof responseData.questionNum === "number") {
          setQuestionNum(responseData.questionNum);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Connection error. Check the server is running and your API key is set.",
            id: Date.now().toString() + "-err",
            ts: Date.now(),
            options: null,
            plan: null,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, localizeDefaultGreeting, isChatEnabled],
  );

  // Keep voice transcript ref in sync with the real sendMessage
  sendMessageRef.current = sendMessage;

  const handleOptionClick = useCallback(
    (opt: string) => sendMessage(opt, {
      languageHint: currentLanguageHintRef.current || opt,
      updateLanguageHint: false,
    }),
    [sendMessage],
  );

  function handleReset() {
    setMessages([createDefaultGreeting()]);
    currentLanguageHintRef.current = "";
    lastGreetingLocalizedHintRef.current = "";
    greetingLocalizationSeqRef.current += 1;
    setInput("");
    setLoading(false);
    setQuestionNum(1);
    setFlowAgentResult(null);
    setFlowAgentImages([]);
    setShowCallAgent(false);
    setHasCallEnded(false);
  }

  // Client is "serious" when they've generated a plan OR sent ≥ 3 messages
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const isSerious = hasPlan || userMessageCount >= 3;

  async function handleCallEnd(transcript: CallEntry[]) {
    setShowCallAgent(false);
    setHasCallEnded(true);

    if (transcript.length === 0) return;

    // Inject call transcript summary message into chat
    const rawSummaryText = isSrsEnabled
      ? "Discovery call complete! Here's the full transcript from our session. I'm now generating your detailed SRS document — this covers functional requirements, user stories, system architecture, risks, and more."
      : "Discovery call complete! Here's the full transcript from our session.";
    const summaryText = await localizeUiText(rawSummaryText);
    const summaryMsg: ChatMessage = {
      role: "assistant",
      content: summaryText,
      id: `call-summary-${Date.now()}`,
      callSummary: transcript,
    };
    setMessages((prev) => [...prev, summaryMsg]);

    // If SRS is not enabled, show only call transcript (no SRS / roadmap / extra cards).
    if (!isSrsEnabled) return;

    // Fetch SRS document from call + chat context
    try {
      const chatCtx = messages
        .filter((m) => m.id !== "greeting" && !m.flowMessage && !m.callSummary && !m.callSrs)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_BASE}/api/call-agent/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callTranscript: transcript,
          chatMessages: chatCtx,
          existingPlan: planMsg?.plan ?? null,
        }),
      });
      const data = await res.json();

      // Prefer the rich SRS document; fall back to legacy plan
      if (data.enhanced && data.srs) {
        const srsText = await localizeUiText("📄 **Software Requirements Specification** — generated from your discovery call:");
        const srsMsg: ChatMessage = {
          role: "assistant",
          content: srsText,
          id: `call-srs-${Date.now()}`,
          callSrs: data.srs,
          questionNum: 0,
        };
        setMessages((prev) => [...prev, srsMsg]);
      } else if (data.enhanced && data.plan) {
        const roadmapText = await localizeUiText("✨ **Refined roadmap** — updated with insights from our call:");
        const enhancedPlanMsg: ChatMessage = {
          role: "assistant",
          content: roadmapText,
          id: `call-plan-${Date.now()}`,
          plan: data.plan,
          questionNum: 0,
        };
        setMessages((prev) => [...prev, enhancedPlanMsg]);
      }
    } catch (err) {
      console.error("[handleCallEnd] SRS fetch error:", err);
    }
  }

  async function runFlowAgent() {
    setFlowAgentLoading(true);
    setFlowAgentResult(null);
    setFlowAgentImages([]);
    try {
      const history = messages.filter((m) => m.id !== "greeting").map((m) => ({ role: m.role, content: m.content }));
      const planMsg = messages.find((m) => m.plan);
      const plan = planMsg?.plan ?? null;
      const res = await fetch(`${API_BASE}/api/flow-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, plan }),
      });
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      if (!contentType.includes("application/json") || text.trimStart().startsWith("<")) {
        setFlowAgentResult({
          frd: "The API server did not respond with JSON. Make sure the backend is running (e.g. run `node server.js` or `npm run server` on port 3001) and that the app is using the same origin or set VITE_API_URL.",
          designs: [],
        });
        return;
      }
      let data: { frd?: string; designs?: unknown[]; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        setFlowAgentResult({ frd: "Invalid JSON from server.", designs: [] });
        return;
      }
      if (data.error && !data.frd && !data.designs?.length) {
        setFlowAgentResult({ frd: `Error: ${data.error}`, designs: [] });
      } else {
        type DesignItem = { title?: string; description?: string; keyScreens?: string[] };
        const designs: DesignItem[] = Array.isArray(data.designs)
          ? data.designs.map((d: unknown) => {
            const x = d as DesignItem;
            return {
              title: typeof x.title === "string" ? x.title : undefined,
              description: typeof x.description === "string" ? x.description : undefined,
              keyScreens: Array.isArray(x.keyScreens) ? x.keyScreens : undefined,
            };
          })
          : [];
        setFlowAgentResult({ frd: data.frd || "", designs });
      }
    } catch (e) {
      setFlowAgentResult({
        frd: `Request failed: ${(e as Error).message}. Is the API server running on port 3001?`,
        designs: [],
      });
    } finally {
      setFlowAgentLoading(false);
    }
  }

  async function runFlowAgentImages() {
    if (!flowAgentResult?.designs?.length) return;
    setFlowAgentImagesLoading(true);
    setFlowAgentImages([]);
    try {
      const res = await fetch(`${API_BASE}/api/flow-agent/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designs: flowAgentResult.designs.map((d) => ({ title: d.title, description: d.description })),
        }),
      });
      const text = await res.text();
      let data: { images?: Array<{ index: number; dataUrl?: string; error?: string }>; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        setFlowAgentImages([{ index: 0, error: "Invalid response from server" }]);
        return;
      }
      if (data.images && data.images.length > 0) {
        setFlowAgentImages(data.images);
      } else if (data.error) {
        setFlowAgentImages([{ index: 0, error: data.error }]);
      }
    } catch (e) {
      setFlowAgentImages([{ index: 0, error: (e as Error).message }]);
    } finally {
      setFlowAgentImagesLoading(false);
    }
  }

  return (
    <BrandContext.Provider value={brandConfig}>
    <AnimatePresence>
      {showChat && (
        <motion.div
          initial={fullScreen ? false : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={fullScreen ? undefined : { opacity: 0, y: 24, scale: 0.96 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={
            fullScreen
              ? `flex flex-col lg:flex-row overflow-hidden relative ${isDarkTheme ? "bg-transparent" : "bg-white"}`
              : "fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          }
          style={
            fullScreen
              ? { height: "100%", minHeight: 0, maxHeight: "100%", background: "transparent", display: "flex" }
              : isDarkTheme
                ? {
                  width: "min(420px, calc(100vw - 24px))",
                  maxHeight: "580px",
                  background: "linear-gradient(160deg, rgba(10,8,20,0.98), rgba(6,6,9,0.99))",
                  border: "1px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 30px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(124,58,237,0.15)",
                }
                : {
                  width: "min(420px, calc(100vw - 24px))",
                  maxHeight: "580px",
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
                }
          }
        >
          {/* FullScreen: case studies sidebar (LEFT) then chat column (right); chat column must constrain height so input sticks to bottom */}
          {fullScreen && (messages.length > 1 || hasPlan) && (
            <>
              {/* ── Desktop sidebar ── */}
              <div
                className="hidden lg:flex flex-col w-72 flex-shrink-0 border-r border-white/10 overflow-hidden order-first"
                style={{
                  paddingTop: "max(0.625rem, env(safe-area-inset-top, 0px))",
                  background: isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(248,250,252,0.98)",
                  borderRight: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"}`,
                }}
              >
                {/* Sidebar header */}
                <div className="px-4 pt-3 pb-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-medium uppercase tracking-widest" style={{ color: isDarkTheme ? "#fff" : "#1e293b" }}>Case Studies</p>
                      <p className="text-sm mt-0.5" style={{ color: isDarkTheme ? "rgba(255,255,255,0.5)" : "rgba(30,41,59,0.6)" }}>Matched to your project</p>
                    </div>
                    {/* <div
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)" }}
                    >
                      <span className="text-[11px] text-violet-300">✦</span>
                    </div> */}
                  </div>
                </div>

                {/* Cards scroll area */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                  {caseStudiesLoading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="rounded-2xl animate-pulse"
                          style={{ height: 130, background: isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  ) : displayCaseStudies.length == 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                        style={{ background: isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: isDarkTheme ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}>📂</div>
                      <p 
                        className={`text-[11px] leading-relaxed max-w-[180px] ${isDarkTheme ? "text-white/30" : "text-[rgba(30,41,59,0.6)]"}`}
                      >
                        Case studies will appear here as you describe your project
                      </p>
                    </div>
                  ) : (
                    displayCaseStudies.map((cs, i) => {
                      const ct = CS_CARD_THEMES[i % CS_CARD_THEMES.length]
                      const bgImage = getCaseStudyImage(cs.title, cs.imageUrl)
                      return (
                        <motion.a
                          key={cs.url}
                          href={cs.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          initial={{ opacity: 0, y: 14, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ delay: i * 0.08, duration: 0.32, ease: 'easeOut' }}
                          whileHover={{ scale: 1.025, y: -2 }}
                          className="block rounded-2xl overflow-hidden relative group cursor-pointer"
                          style={{
                            height: 148,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: bgImage
                              ? `url(${bgImage}) center/cover no-repeat, ${ct.bg}`
                              : ct.bg,
                          }}
                        >
                          {/* Dark overlay — heavier when using photo so text stays readable */}
                          <div className="absolute inset-0 pointer-events-none"
                            style={{
                              background: bgImage
                                ? 'linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.55) 50%,rgba(0,0,0,0.25) 100%)'
                                : 'linear-gradient(to top,rgba(0,0,0,0.80) 0%,rgba(0,0,0,0.25) 55%,transparent 100%)'
                            }} />

                          {/* Glow blob (only when no photo) */}
                          {!bgImage && (
                            <div className="absolute rounded-full pointer-events-none"
                              style={{
                                width: '65%', height: '65%', left: ct.blob.x, top: ct.blob.y,
                                background: `radial-gradient(circle,${ct.blob.c},transparent 70%)`,
                                transform: 'translate(-50%,-50%)', filter: 'blur(14px)'
                              }} />
                          )}

                          {/* Star particles (only when no photo) */}
                          {!bgImage && ct.dots && (
                            <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" style={{ opacity: 0.45 }}>
                              {STAR_POSITIONS.map((s, j) => (
                                <circle key={j} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" opacity={s.o} />
                              ))}
                            </svg>
                          )}

                          {/* Hover border glow */}
                          <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            style={{ border: `1px solid ${ct.accent}60`, boxShadow: `inset 0 0 24px ${ct.glow}` }} />

                          {/* Content */}
                          <div className="absolute inset-0 flex flex-col justify-end p-3.5">
                            <h3 className="text-[13px] font-bold text-white leading-snug line-clamp-2 mb-1.5"
                              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                              {cs.title}
                            </h3>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.50)' }}>{brandConfig.brandName} · Portfolio</span>
                              <span className="text-[11px] font-semibold flex items-center gap-1 transition-transform group-hover:translate-x-0.5 duration-150"
                                style={{ color: bgImage ? '#fff' : ct.accent, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                → Read more
                              </span>
                            </div>
                          </div>
                        </motion.a>
                      )
                    })
                  )}
                </div>
              </div>

              {/* ── Mobile horizontal strip ── */}
              <div
                className="lg:hidden flex-shrink-0 border-b border-white/10 px-3 py-2.5 overflow-x-auto order-first"
                style={{ background: "rgba(0,0,0,0.28)" }}
              >
                <p className="text-[10px] font-bold text-white/45 uppercase tracking-widest mb-2">
                  Relevant case study
                </p>
                {caseStudiesLoading ? (
                  <div className="flex items-center gap-1.5 text-white/40 text-[10px]">
                    <span className="typing-dot"  />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span>Finding…</span>
                  </div>
                ) : (
                  <div className="flex gap-2 pb-1">
                    {displayCaseStudies.slice(0, 5).map((cs, i) => {
                      const ct = CS_CARD_THEMES[i % CS_CARD_THEMES.length];
                      const bgImg = getCaseStudyImage(cs.title, cs.imageUrl);
                      return (
                        <a
                          key={cs.url}
                          href={cs.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 rounded-xl overflow-hidden relative group"
                          style={{
                            width: 158,
                            height: 82,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: bgImg ? `url(${bgImg}) center/cover no-repeat, ${ct.bg}` : ct.bg,
                          }}
                        >
                          {!bgImg && (
                            <div
                              className="absolute rounded-full pointer-events-none"
                              style={{
                                width: "60%",
                                height: "60%",
                                left: ct.blob.x,
                                top: ct.blob.y,
                                background: `radial-gradient(circle,${ct.blob.c},transparent 70%)`,
                                transform: "translate(-50%,-50%)",
                                filter: "blur(10px)",
                              }}
                            />
                          )}
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: bgImg
                                ? "linear-gradient(to top,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.3) 60%,transparent 100%)"
                                : "linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 70%)",
                            }}
                          />
                          <div className="absolute inset-0 flex flex-col justify-end p-2.5">
                            <p
                              className="text-[10px] font-bold text-white line-clamp-1 leading-tight"
                              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                            >
                              {cs.title}
                            </p>
                            <p
                              className="text-[9px] mt-0.5 font-semibold"
                              style={{ color: bgImg ? "rgba(255,255,255,0.75)" : ct.accent }}
                            >
                              → Read more
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          <div
            className={fullScreen ? "flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden" : ""}
            style={fullScreen ? { minHeight: 0, flex: "1 1 0%" } : undefined}
          >
            {/* ── Header (only in chat mode, never on welcome/landing) ── */}
            {!(fullScreen && messages.length === 1) && (
              <div
                className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0 relative z-10"
                style={fullScreen ? { paddingTop: "max(0.625rem, env(safe-area-inset-top, 0px))" } : undefined}
                
              >
                {fullScreen ? (
                  <>
                    <div className="relative flex-shrink-0 select-none">
                      <img
                        src={brandConfig.brandLogoSrc}
                        alt={brandConfig.brandName}
                        className="w-full h-full object-contain"
                        style={{ width: '70px' }}
                      />
                    </div>
                    <div className="flex-1" />
                    {/* Voice mode toggle */}
                    {voice.isSupported && isChatEnabled && (
                      <button
                        onClick={toggleVoiceMode}
                        title={voiceModeActive ? "Exit voice mode" : "Start voice conversation"}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-[12px] font-medium ${isDarkTheme ? "text-white/45 hover:text-white/75 hover:bg-white/5" : "text-gray-600 hover:text-gray-800 hover:bg-black/5"}`}
                        {...(voiceModeActive && {
                          style: {
                            background: "rgba(37,99,235,0.2)",
                            color: "#60A5FA",
                            border: "1px solid rgba(37,99,235,0.35)",
                          }
                        })}
                      >
                        {voiceModeActive ? (
                          <>
                            <MicOff size={12} /> End Voice
                          </>
                        ) : (
                          <>
                            <Volume2 size={12} /> Voice
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={handleReset}
                      title="Start over"
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-[12px] font-medium ${isDarkTheme ? "text-white/45 hover:text-white/75 hover:bg-white/5" : "text-gray-600 hover:text-gray-800 hover:bg-black/5"}`}
                    >
                      <PenLine size={12} />
                      New Chat
                    </button>

                    {/* <div className="flex items-center gap-4">
                      <a
                        href="https://theninehertz.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] font-medium transition-opacity hover:opacity-70 hidden sm:block"
                        style={{ color: theme.textTertiary }}
                      >
                        Info
                      </a>

                      <button
                        onClick={() => selectTheme(theme.isDark ? 'minimalist' : 'cyberbunker')}
                        className="flex items-center gap-2 transition-opacity hover:opacity-80"
                      >
                        <span className="text-[12px] font-medium" style={{ color: theme.textTertiary }}>Dark</span>
                        <div className="relative flex-shrink-0" style={{ width: 34, height: 18, borderRadius: 9, background: theme.isDark ? '#4B5563' : '#D1D5DB', transition: 'background 0.2s' }}>
                          <motion.div
                            style={{ position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
                            animate={{ left: theme.isDark ? 18 : 2 }}
                            transition={{ duration: 0.15 }}
                          />
                        </div>
                      </button>

                      <motion.button
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-75"
                        animate={{ background: theme.bgTertiary, color: theme.textTertiary }}
                        transition={{ duration: 0.4 }}
                      >
                        <User size={13} />
                      </motion.button>
                    </div> */}
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg shadow-violet-900/50 flex-shrink-0">
                      <Zap size={16} className="text-white" fill="white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">9Hertz — Project Architect</p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] text-white/35">Guided Discovery · Powered by 9Hertz</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleReset}
                        title="Start over"
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/35 hover:text-white/60 transition-colors"
                      >
                        <RotateCcw size={12} />
                      </button>
                      <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/35 hover:text-white/60 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* ── Discovery Progress (hidden when fullScreen / simple UI) ── */}
            {!fullScreen && <DiscoveryProgress questionNum={hasPlan ? 0 : questionNum} />}
            {/* ── Call Agent Overlay (replaces messages when active) ── */}
            {showCallAgent && isCallEnabled && (
              <div
                className={`flex-1 min-h-0 flex flex-col ${fullScreen ? "px-4 py-4 max-w-2xl mx-auto w-full" : "px-3 py-3"}`}
                style={{ minHeight: 0, flex: "1 1 0%" }}
              >
                <AnimatePresence>
                  <CallAgentOverlay
                    key="call-agent"
                    chatMessages={messages}
                    plan={planMsg?.plan ?? null}
                    onEnd={handleCallEnd}
                    languageHint={isMultiLanguageEnabled ? currentLanguageHintRef.current : "en-US"}
                    srsEnabled={isSrsEnabled}
                    isDarkTheme={isDarkTheme}
                  />
                </AnimatePresence>
              </div>
            )}
            {/* ── Messages (only this area scrolls; input stays at bottom) ── */}
            {!showCallAgent && (
              <div
                ref={messagesScrollRef}
                className={`flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-4 relative z-10 w-[1100px] ${fullScreen ? "px-4 py-6 max-w-full mx-auto" : "px-4 py-4"}`}
                style={{
                  minHeight: 0,
                  flex: "1 1 0%",
                  ...(fullScreen ? { scrollPaddingTop: 12, WebkitOverflowScrolling: "touch" as const } : {}),
                }}
              >
                {/* FullScreen welcome: vertically centered with embedded input */}
                {fullScreen && messages.length === 1 && messages[0]?.role === "assistant" ? (
                  <div
                    className="flex flex-col items-center justify-center text-center w-full"
                    style={{ minHeight: "100%" }}
                  >
                    <WelcomeScreen
                      message={messages[0]}
                      onOptionClick={handleOptionClick}
                      input={input}
                      onInputChange={setInput}
                      onSend={sendMessage}
                      loading={loading}
                      chatEnabled={isChatEnabled}
                      isDarkTheme={isDarkTheme}
                      onMicClick={voice.isSupported ? (voiceModeActive ? toggleVoiceMode : startVoiceInput) : undefined}
                      voiceSupported={voice.isSupported}
                      voiceActive={voiceModeActive}
                    />
                  </div>
                ) : (
                  <div
                    className="flex flex-col gap-4 w-full min-h-0"
                    style={fullScreen ? { paddingTop: 12 } : undefined}
                  >
                    {messages.map((msg) =>
                      msg.flowMessage ? (
                        <FlowChatBubble
                          key={msg.id}
                          flowAgentLoading={flowAgentLoading}
                          flowAgentResult={flowAgentResult}
                          flowAgentImages={flowAgentImages}
                          flowAgentImagesLoading={flowAgentImagesLoading}
                          onRunFlowAgent={runFlowAgent}
                          onRunFlowAgentImages={runFlowAgentImages}
                          onClose={() => {
                            setMessages((prev) => prev.filter((m) => !m.flowMessage));
                            setFlowAgentResult(null);
                            setFlowAgentImages([]);
                          }}
                        />
                      ) : (
                        <MessageBubble
                          key={msg.id}
                          msg={msg}
                          onOptionClick={handleOptionClick}
                          onSeeFlow={() => {
                            if (messages.some((m) => m.flowMessage)) return;
                            setMessages((prev) => [
                              ...prev,
                              { role: "assistant", content: "", id: `flow-${Date.now()}`, flowMessage: true },
                            ]);
                          }}
                          fullScreen={fullScreen}
                          isDarkTheme={isDarkTheme}
                          chatEnabled={isChatEnabled}
                        />
                      ),
                    )}
                    
                    {/* Typing indicator - inside messages container to appear at bottom */}
                    {loading && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2.5"
                      >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center flex-shrink-0">
                          <Zap size={11} className="text-white" fill="white" />
                        </div>
                        <div
                          className="px-4 py-3 rounded-2xl"
                          style={{
                            background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgb(88 88 89)",
                            border: isDarkTheme ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                            borderRadius: "16px 16px 16px 4px",
                          }}
                        >
                          <div className="flex gap-1.5 items-center">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            )}{" "}
            {/* end !showCallAgent */}
            {/* ── Talk to Alex — AI Calling Agent banner ── */}
            {fullScreen &&
              isCallEnabled &&
              (!isChatEnabled || (messages.length > 1 && isSerious)) &&
              !showCallAgent &&
              !hasCallEnded && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                className={`px-4 pb-2 flex-shrink-0 ${fullScreen ? "max-w-2xl mx-auto w-full" : ""}`}
                style={{
                  marginTop:"10px"
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    unlockAudioContext();
                    setShowCallAgent(true);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-[12px] font-medium transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${isDarkTheme ? "text-white" : "text-[#0B0B0C]"}`}
                  style={{
                    background: "linear-gradient(135deg, rgba(124,58,237,0.14), rgba(16,185,129,0.06))",
                    border: "1px solid rgba(124,58,237,0.22)",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                        boxShadow: "0 0 12px rgba(124,58,237,0.4)",
                      }}
                    >
                      <Phone size={12} className="text-white" />
                    </div>
                    <div className="text-left min-w-0">
                      <p 
                        className={`text-[12px] font-semibold leading-tight ${isDarkTheme ? "text-white/90" : "text-[#0B0B0C]"}`}
                      >
                        {isSrsEnabled ? "Start SRS Discovery Call with Alex" : "Start Discovery Call with Alex"}
                      </p>
                      <p 
                        className={`text-[10px] leading-tight mt-0.5 ${isDarkTheme ? "text-white/40" : "text-[#0B0B0C]"}`}
                      >
                        {isSrsEnabled ? "Voice-led · 12 requirement areas · full SRS document" : "Voice-led · 12 requirement areas · transcript only"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    <span className="text-[10px] text-emerald-400/80 font-medium">Live</span>
                  </div>
                </button>
              </motion.div>
            )}
            {/* ── Voice Chat Overlay ── */}
            {fullScreen && voiceModeActive && isChatEnabled && (
              <VoiceChatOverlay
                isListening={voice.isListening}
                isSpeaking={voice.isSpeaking}
                interimText={voice.interimText}
                detectedLocale={voice.detectedLocale}
                onStop={toggleVoiceMode}
                onTapMic={voice.startListening}
                isDarkTheme={isDarkTheme}
              />
            )}
            {/* ── Input (pinned to bottom — hidden on welcome/landing state) ── */}
            {isChatEnabled && !(fullScreen && messages.length === 1) && (
              <div
                className={`px-4 pt-2 flex-shrink-0 border-t border-white/5 relative z-10 w-[1100px] ${fullScreen ? "max-w-full mx-auto" : "pb-4"}`}
                style={
                  fullScreen
                    ? { paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))", flexShrink: 0 }
                    : undefined
                }
              >
                <div
                  className={`rounded-2xl transition-all duration-200 ${fullScreen ? "relative min-h-[132px] flex flex-col" : "flex gap-2 items-center"}`}
                  style={{
                    background:isDarkTheme ? 'rgb(17, 17, 14)':"#0000000D",
                    border: isDarkTheme ? "1px solid rgb(41, 41, 39)":"1px solid rgba(0,0,0,0.12)",
                    padding: fullScreen ? "0" : "10px 14px",
                  }}
                >
                  {fullScreen ? (
                    <>
                      <div className="flex-1 px-5 pt-4 pb-14">
                        <input
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              sendMessage(input);
                            }
                          }}
                          placeholder="Describe your idea..."
                          disabled={loading}
                          data-chatbot-input
                          className="w-full bg-transparent text-[15px] outline-none disabled:opacity-50"
                          style={{
                            color: isDarkTheme ? undefined : "rgb(11, 11, 12)",
                          }}
                        />
                      </div>

                      <div className="absolute bottom-4 left-4">
                        <button
                          type="button"
                          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-foreground/10"
                          style={{ border: "1px solid hsl(var(--border) / 0.5)", background: isDarkTheme ? "hsl(var(--background) / 0.9)" : "black" }}
                        >
                          <Plus size={16} className="text-foreground/70" />
                        </button>
                      </div>

                      <div className="absolute bottom-4 right-4 flex items-center gap-2">
                        {voice.isSupported && (
                          <button
                            type="button"
                            onClick={toggleVoiceMode}
                            title={voiceModeActive ? "Exit voice mode" : "Voice conversation"}
                            className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-opacity ${isDarkTheme ? "border-white/10 hover:bg-white/20" : "border-[#0B0B0C1A] hover:bg-gray-500/10"}`}
                          >
                            {voiceModeActive ? (
                              <MicOff size={16} className={isDarkTheme ? "text-red-400/90" : "text-red-500"} />
                            ) : (
                              <img
                                src="/assets/icons/mic_dark.png"
                                alt="Microphone"
                                className="w-[17px] h-[17px] object-contain"
                                style={{ filter: (isDarkTheme ? "none" : "invert(1)") }}
                              />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => sendMessage(input)}
                          disabled={!input.trim() || loading}
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 hover:scale-105 active:scale-95"
                          style={{
                            background: input.trim() ? "#2563EB" : "rgba(255,255,255,0.06)",
                            boxShadow: input.trim() ? "0 0 14px rgba(37,99,235,0.45)" : "none",
                          }}
                        >
                          <img
                            src="/assets/icons/Frame_Dark.png"
                            alt="Send"
                            className="w-full h-full object-contain"
                          />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
                        placeholder="What’s on your mind today..."
                        disabled={loading}
                        className="flex-1 bg-transparent text-[13.5px] text-white placeholder-white/25 outline-none disabled:opacity-50 min-w-0"
                      />

                      <button
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim() || loading}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-25 hover:scale-105 active:scale-95 flex-shrink-0"
                        style={{
                          background: input.trim() ? "#2563EB" : "rgba(255,255,255,0.06)",
                          boxShadow: input.trim() ? "0 0 14px rgba(37,99,235,0.45)" : "none",
                        }}
                      >
                        <img
                          src="/assets/icons/Frame_Dark.png"
                          alt="Send"
                          className="w-[13px] h-[13px] object-contain"
                        />
                      </button>
                    </>
                  )}
                </div>
                {!fullScreen && (
                  <p className="text-[10px] text-white/18 text-center mt-2">
                    {brandConfig.brandName} assistant — context from your configured company site
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </BrandContext.Provider>
  );
}
