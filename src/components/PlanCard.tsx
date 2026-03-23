import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Clock, Wrench, Rocket, CheckCircle2 } from "lucide-react";
import type { ProjectPlan } from "../types/chat";

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

export interface PlanCardProps {
  plan: ProjectPlan;
  onSeeFlow?: () => void;
  isDarkTheme?: boolean;
}

export default function PlanCard({ plan, isDarkTheme = true }: PlanCardProps) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const colors = PILLAR_COLORS[plan.pillar] || PILLAR_COLORS.BUILD;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl overflow-hidden mt-3 w-full"
      style={{
        background: isDarkTheme ? "rgba(8,8,16,0.95)" : "#ffffff",
        border: `1px solid ${colors.border}`,
        boxShadow: isDarkTheme 
          ? `0 0 30px ${colors.glow}, 0 8px 32px rgba(0,0,0,0.4)`
          : `0 0 20px ${colors.glow}, 0 4px 16px rgba(0,0,0,0.1)`,
      }}
    >
      <div className="px-5 pt-5 pb-4" style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase"
            style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
          >
            {plan.pillar} Pillar
          </span>
          {plan.pillar !== "EVOLVE" && (
            <div className="flex items-center gap-1.5">
              <Clock size={10} style={{ color: colors.text }} />
              <span className="text-[10px] font-medium" style={{ color: colors.text }}>
                {plan.estimatedTimeline}
              </span>
            </div>
          )}
        </div>
        <h3 className={`text-base font-bold leading-snug mb-1.5 ${isDarkTheme ? "text-white" : "text-[#0B0B0C]"}`}>{plan.title}</h3>
        {plan.caseStudyMatch && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={11} className={isDarkTheme ? "text-emerald-400" : "text-emerald-600"} />
            <span className={`text-[11px] ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.6)]"}`}>
              Similar case: <span className={`${isDarkTheme ? "text-white/75" : "text-[#0B0B0C]"} font-medium`}>&quot;{plan.caseStudyMatch}&quot;</span>
            </span>
          </div>
        )}
      </div>

      {plan.expertiseSummary && (
        <div className={`px-5 py-3 border-b ${isDarkTheme ? "border-white/5" : "border-[rgba(0,0,0,0.08)]"}`}>
          <p className={`text-[11px] italic leading-relaxed ${isDarkTheme ? "text-white/45" : "text-[rgba(11,11,12,0.6)]"}`}>&quot;{plan.expertiseSummary}&quot;</p>
        </div>
      )}

      <div className="px-5 py-4 space-y-2">
        <p className={`text-[9px] font-bold tracking-[0.25em] uppercase mb-3 ${isDarkTheme ? "text-white/30" : "text-[rgba(11,11,12,0.5)]"}`}>Project Roadmap</p>
        {plan.phases.map((phase, idx) => {
          const PhaseIcon = PHASE_ICONS[idx] || Rocket;
          const isOpen = expandedPhase === idx;

          return (
            <motion.div
              key={phase.num}
              className="rounded-xl overflow-hidden cursor-pointer"
              style={{ 
                background: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                border: isDarkTheme ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)"
              }}
              onClick={() => setExpandedPhase(isOpen ? null : idx)}
              whileHover={{ borderColor: isDarkTheme ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)" }}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                >
                  <PhaseIcon size={13} style={{ color: colors.text }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-[12px] font-semibold ${isDarkTheme ? "text-white/90" : "text-[#0B0B0C]"}`}>
                      Phase {phase.num} — {phase.name}
                    </span>
                    {plan.pillar !== "EVOLVE" && (
                      <span className={`text-[10px] ml-2 flex-shrink-0 ${isDarkTheme ? "text-white/35" : "text-[rgba(11,11,12,0.5)]"}`}>{phase.duration}</span>
                    )}
                  </div>
                </div>
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex-shrink-0 ${isDarkTheme ? "text-white/25" : "text-[rgba(11,11,12,0.4)]"}`}
                >
                  <ChevronRight size={12} />
                </motion.span>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className={`px-4 pb-3 pt-1 border-t ${isDarkTheme ? "border-white/5" : "border-[rgba(0,0,0,0.08)]"}`}>
                      <ul className="space-y-1.5">
                        {phase.tasks.map((task, ti) => (
                          <li key={ti} className={`flex items-start gap-2 text-[11px] ${isDarkTheme ? "text-white/50" : "text-[rgba(11,11,12,0.7)]"}`}>
                            <span
                              className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: colors.text }}
                            />
                            {task}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {plan.techStack?.length > 0 && (
        <div className="px-5 pb-5">
          <div className="flex flex-wrap gap-1.5">
            {plan.techStack.map((tech) => (
              <span
                key={tech}
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono ${isDarkTheme ? "text-white/40" : "text-[rgba(11,11,12,0.6)]"}`}
                style={{ 
                  background: isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                  border: isDarkTheme ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.08)"
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
