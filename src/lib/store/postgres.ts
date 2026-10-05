import type { Conversation, DisplayMessage } from "../types";
import type { ConversationPatch, Store } from "./types";

// Minimal query interface so the same store runs on the `postgres` driver in
// production and on PGlite (in-process Postgres) in tests.
export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

type Row = Record<string, unknown>;

const toConversation = (r: Row): Conversation => ({
  id: String(r.id),
  channel: r.channel as Conversation["channel"],
  externalUserId: (r.external_user_id as string | null) ?? null,
  visitorToken: String(r.visitor_token),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  mode: r.mode as Conversation["mode"],
  stage: r.stage as Conversation["stage"],
  score: Number(r.score),
  handoffReason: (r.handoff_reason as string | null) ?? null,
  unreadForStaff: Boolean(r.unread_for_staff),
  name: (r.name as string | null) ?? null,
  country: (r.country as string | null) ?? null,
  language: (r.language as string | null) ?? null,
  treatment: (r.treatment as string | null) ?? null,
  timeframe: (r.timeframe as string | null) ?? null,
  budget: (r.budget as string | null) ?? null,
  whatsapp: (r.whatsapp as string | null) ?? null,
  email: (r.email as string | null) ?? null,
  medicalNotes: (r.medical_notes as string | null) ?? null,
  summary: (r.summary as string | null) ?? null,
  apiHistory: (r.api_history as Conversation["apiHistory"] | undefined) ?? [],
});

const toMessage = (r: Row): DisplayMessage => ({
  id: String(r.id),
  conversationId: String(r.conversation_id),
  createdAt: iso(r.created_at),
  role: r.role as DisplayMessage["role"],
  text: String(r.text),
  syncedToAi: Boolean(r.synced_to_ai),
});

// Whitelist of patchable fields → column names. Column names are never built from input.
const PATCH_COLUMNS: Record<keyof ConversationPatch, string> = {
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

const LIST_COLUMNS =
  "id, channel, external_user_id, visitor_token, created_at, updated_at, mode, stage, score, handoff_reason, unread_for_staff, name, country, language, treatment, timeframe, budget, whatsapp, email, medical_notes, summary";

export function createPostgresStore(query: Query): Store {
  return {
    async createConversation(init = {}) {
      const [row] = await query(
        `insert into conversations (channel, external_user_id, name, whatsapp)
         values ($1, $2, $3, $4) returning *`,
        [init.channel ?? "web", init.externalUserId ?? null, init.name ?? null, init.whatsapp ?? null],
      );
      return toConversation(row);
    },

    async getConversation(id) {
      const [row] = await query(`select * from conversations where id = $1`, [id]);
      return row ? toConversation(row) : null;
    },

    async findConversationByExternalUser(channel, externalUserId) {
      const [row] = await query(
        `select * from conversations where channel = $1 and external_user_id = $2`,
        [channel, externalUserId],
      );
      return row ? toConversation(row) : null;
    },

    async listConversations() {
      // The list view doesn't need the (potentially large) model history.
      const rows = await query(
        `select ${LIST_COLUMNS} from conversations order by updated_at desc limit 500`,
      );
      return rows.map(toConversation);
    },

    async updateConversation(id, patch) {
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [key, value] of Object.entries(patch)) {
        const column = PATCH_COLUMNS[key as keyof ConversationPatch];
        if (!column || value === undefined) continue;
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
      sets.push("updated_at = now()");
      await query(`update conversations set ${sets.join(", ")} where id = $1`, params);
    },

    async appendApiHistory(id, entries) {
      // Single statement, so concurrent appends can't overwrite each other.
      await query(
        `update conversations set api_history = api_history || $2::jsonb, updated_at = now() where id = $1`,
        [id, JSON.stringify(entries)],
      );
    },

    async addMessage(conversationId, role, text) {
      const [row] = await query(
        `insert into messages (conversation_id, role, text, synced_to_ai)
         values ($1, $2, $3, $4) returning *`,
        [conversationId, role, text, role !== "staff"],
      );
      await query(`update conversations set updated_at = $2 where id = $1`, [conversationId, row.created_at]);
      return toMessage(row);
    },

    async listMessages(conversationId, afterIso) {
      const rows = afterIso
        ? await query(
            `select * from messages where conversation_id = $1 and created_at > $2::timestamptz order by created_at`,
            [conversationId, afterIso],
          )
        : await query(`select * from messages where conversation_id = $1 order by created_at`, [conversationId]);
      return rows.map(toMessage);
    },

    async listUnsyncedStaffMessages(conversationId) {
      const rows = await query(
        `select * from messages where conversation_id = $1 and synced_to_ai = false order by created_at`,
        [conversationId],
      );
      return rows.map(toMessage);
    },

    async markStaffMessagesSynced(ids) {
      if (ids.length === 0) return;
      await query(`update messages set synced_to_ai = true where id = any($1::uuid[])`, [ids]);
    },

    async claimEvent(id) {
      const rows = await query(
        `insert into processed_events (id) values ($1) on conflict (id) do nothing returning id`,
        [id],
      );
      return rows.length > 0;
    },
  };
}
