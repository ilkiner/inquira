import type Anthropic from "@anthropic-ai/sdk";

export type ApiMessage = Anthropic.Beta.BetaMessageParam;

export const STAGES = ["new", "qualifying", "qualified", "handoff", "booked", "lost"] as const;
export type Stage = (typeof STAGES)[number];

// "ai": the assistant answers. "human": a coordinator took over, AI stays silent.
export type Mode = "ai" | "human";

export type LeadFields = {
  name: string | null;
  country: string | null;
  language: string | null;
  treatment: string | null;
  timeframe: string | null;
  budget: string | null;
  whatsapp: string | null;
  email: string | null;
  medicalNotes: string | null;
  summary: string | null;
};

export type Conversation = LeadFields & {
  id: string;
  visitorToken: string;
  createdAt: string;
  updatedAt: string;
  mode: Mode;
  stage: Stage;
  score: number; // 0–100, how likely this lead books
  handoffReason: string | null;
  unreadForStaff: boolean;
  // Append-only Claude API history. Never rewrite earlier entries: the API
  // validates thinking blocks against the exact history that produced them.
  apiHistory: ApiMessage[];
};

export type DisplayRole = "patient" | "assistant" | "staff";

export type DisplayMessage = {
  id: string;
  conversationId: string;
  createdAt: string;
  role: DisplayRole;
  text: string;
  // Staff messages are folded into the AI history on the next AI turn.
  syncedToAi: boolean;
};

export const EMPTY_LEAD: LeadFields = {
  name: null,
  country: null,
  language: null,
  treatment: null,
  timeframe: null,
  budget: null,
  whatsapp: null,
  email: null,
  medicalNotes: null,
  summary: null,
};
