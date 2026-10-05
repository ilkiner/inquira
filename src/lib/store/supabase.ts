import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, DisplayMessage } from "../types";
import type { ConversationPatch, Store } from "./types";

type ConversationRow = {
  id: string;
  visitor_token: string;
  created_at: string;
  updated_at: string;
  mode: Conversation["mode"];
  stage: Conversation["stage"];
  score: number;
  handoff_reason: string | null;
  unread_for_staff: boolean;
  name: string | null;
  country: string | null;
  language: string | null;
  treatment: string | null;
  timeframe: string | null;
  budget: string | null;
  whatsapp: string | null;
  email: string | null;
  medical_notes: string | null;
  summary: string | null;
  api_history: Conversation["apiHistory"];
};

type MessageRow = {
  id: string;
  conversation_id: string;
  created_at: string;
  role: DisplayMessage["role"];
  text: string;
  synced_to_ai: boolean;
};

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  visitorToken: r.visitor_token,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  mode: r.mode,
  stage: r.stage,
  score: r.score,
  handoffReason: r.handoff_reason,
  unreadForStaff: r.unread_for_staff,
  name: r.name,
  country: r.country,
  language: r.language,
  treatment: r.treatment,
  timeframe: r.timeframe,
  budget: r.budget,
  whatsapp: r.whatsapp,
  email: r.email,
  medicalNotes: r.medical_notes,
  summary: r.summary,
  apiHistory: r.api_history ?? [],
});

const toMessage = (r: MessageRow): DisplayMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  createdAt: r.created_at,
  role: r.role,
  text: r.text,
  syncedToAi: r.synced_to_ai,
});

function toRowPatch(patch: ConversationPatch): Partial<ConversationRow> {
  const map: Record<string, keyof ConversationRow> = {
    mode: "mode",
    stage: "stage",
    score: "score",
    handoffReason: "handoff_reason",
    unreadForStaff: "unread_for_staff",
    name: "name",
    country: "country",
    language: "language",
    treatment: "treatment",
    timeframe: "timeframe",
    budget: "budget",
    whatsapp: "whatsapp",
    email: "email",
    medicalNotes: "medical_notes",
    summary: "summary",
  };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && map[key]) row[map[key]] = value;
  }
  return row as Partial<ConversationRow>;
}

function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`);
  return result.data as T;
}

export function createSupabaseStore(url: string, serviceRoleKey: string): Store {
  const sb: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async createConversation() {
      return toConversation(must(await sb.from("conversations").insert({}).select().single()));
    },

    async getConversation(id) {
      const row = must(await sb.from("conversations").select().eq("id", id).maybeSingle());
      return row ? toConversation(row) : null;
    },

    async listConversations() {
      // The dashboard list doesn't need the (potentially large) API history.
      const rows = must(
        await sb
          .from("conversations")
          .select(
            "id, visitor_token, created_at, updated_at, mode, stage, score, handoff_reason, unread_for_staff, name, country, language, treatment, timeframe, budget, whatsapp, email, medical_notes, summary",
          )
          .order("updated_at", { ascending: false })
          .limit(500),
      );
      return (rows as Omit<ConversationRow, "api_history">[]).map((r) =>
        toConversation({ ...r, api_history: [] }),
      );
    },

    async updateConversation(id, patch) {
      must(
        await sb
          .from("conversations")
          .update({ ...toRowPatch(patch), updated_at: new Date().toISOString() })
          .eq("id", id),
      );
    },

    async appendApiHistory(id, entries) {
      must(await sb.rpc("append_api_history", { conv_id: id, entries }));
    },

    async addMessage(conversationId, role, text) {
      const row = must(
        await sb
          .from("messages")
          .insert({ conversation_id: conversationId, role, text, synced_to_ai: role !== "staff" })
          .select()
          .single(),
      ) as MessageRow;
      must(
        await sb.from("conversations").update({ updated_at: row.created_at }).eq("id", conversationId),
      );
      return toMessage(row);
    },

    async listMessages(conversationId, afterIso) {
      let query = sb
        .from("messages")
        .select()
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (afterIso) query = query.gt("created_at", afterIso);
      return (must(await query) as MessageRow[]).map(toMessage);
    },

    async listUnsyncedStaffMessages(conversationId) {
      const rows = must(
        await sb
          .from("messages")
          .select()
          .eq("conversation_id", conversationId)
          .eq("synced_to_ai", false)
          .order("created_at", { ascending: true }),
      ) as MessageRow[];
      return rows.map(toMessage);
    },

    async markStaffMessagesSynced(ids) {
      if (ids.length === 0) return;
      must(await sb.from("messages").update({ synced_to_ai: true }).in("id", ids));
    },
  };
}
