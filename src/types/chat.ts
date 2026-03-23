/**
 * Shared types for chat, discovery plan, and SRS.
 */

export interface PlanPhase {
  num: number;
  name: string;
  duration: string;
  tasks: string[];
}

export interface ProjectPlan {
  title: string;
  pillar: "BUILD" | "RUN" | "EVOLVE";
  caseStudyMatch: string;
  expertiseSummary: string;
  phases: PlanPhase[];
  techStack: string[];
  estimatedTimeline: string;
  nextStep: string;
}

export interface CallEntry {
  speaker: "ai" | "user";
  text: string;
  id: string;
}

export type CallStatus = "ringing" | "active" | "thinking" | "speaking" | "ended";

export interface SRSTargetUser {
  persona: string;
  needs: string;
  volume?: string;
}

export interface SRSFunctionalModule {
  module: string;
  priority: string;
  requirements: string[];
}

export interface SRSIntegration {
  service: string;
  purpose: string;
  priority?: string;
}

export interface SRSRisk {
  risk: string;
  impact: string;
  mitigation: string;
}

export interface SRSDocument {
  title: string;
  version?: string;
  executiveSummary?: string;
  businessObjective?: string;
  successMetrics?: string[];
  targetUsers?: SRSTargetUser[];
  scope?: { inScope: string[]; outOfScope: string[] };
  functionalRequirements?: SRSFunctionalModule[];
  nonFunctionalRequirements?: {
    performance?: string;
    scalability?: string;
    availability?: string;
    security?: string;
    usability?: string;
  };
  userStories?: string[];
  systemArchitecture?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    infrastructure?: string[];
    thirdParty?: string[];
  };
  integrations?: SRSIntegration[];
  dataRequirements?: string;
  securityCompliance?: string[];
  phases?: Array<{ num: number; name: string; duration: string; tasks: string[] }>;
  estimatedTimeline?: string;
  budgetRange?: string;
  teamStructure?: string;
  risks?: SRSRisk[];
  assumptions?: string[];
  pillar?: "BUILD" | "RUN" | "EVOLVE";
  nextStep?: string;
}

export type WireSectionType =
  | "nav"
  | "hero"
  | "grid"
  | "cards"
  | "list"
  | "form"
  | "stats"
  | "banner"
  | "tabs"
  | "footer"
  | "bottomnav"
  | "content";

export interface DesignPageSection {
  name: string;
  type: WireSectionType;
  desc: string;
}

export interface DesignPage {
  id: string;
  name: string;
  type: string;
  icon: string;
  tagline?: string;
  platform: "web" | "mobile" | "both";
  colorPalette?: { primary?: string; secondary?: string; background?: string; surface?: string; accent?: string };
  sections: DesignPageSection[];
  keyComponents: string[];
  designRationale?: string;
  userFlow?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  id: string;
  ts?: number;
  options?: string[] | null;
  plan?: ProjectPlan | null;
  questionNum?: number;
  flowMessage?: boolean;
  callSummary?: CallEntry[];
  callSrs?: SRSDocument;
}

export const DEFAULT_GREETING_OPTIONS = [
  "CRM/ERP System",
  "Mobile Application",
  "AI Integration",
  "Cloud/DevOps",
  "E-Commerce Platform",
];

export function createDefaultGreeting(): ChatMessage {
  return {
    role: "assistant",
    content: "How can I help you today?",
    id: "greeting",
    ts: Date.now(),
    options: [...DEFAULT_GREETING_OPTIONS],
    questionNum: 1,
  };
}

export const DEFAULT_GREETING: ChatMessage = createDefaultGreeting();
