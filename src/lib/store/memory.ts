import { randomUUID } from "node:crypto";
import { EMPTY_LEAD, type Conversation, type DisplayMessage } from "../types";
import type { Store } from "./types";

// Dev/demo store. Data lives in process memory and is lost on restart.
// Kept on globalThis so Next.js hot reloads don't wipe it.
type MemoryDb = { conversations: Map<string, Conversation>; messages: DisplayMessage[]; events: Set<string> };
const g = globalThis as unknown as { __inquiraDb?: MemoryDb };
const db: MemoryDb = (g.__inquiraDb ??= { conversations: new Map(), messages: [], events: new Set() });

// Strictly increasing timestamps: two writes in the same millisecond must still
// sort and compare correctly, or "messages after X" polling would skip one.
let lastMs = 0;
const now = () => {
  lastMs = Math.max(Date.now(), lastMs + 1);
  return new Date(lastMs).toISOString();
};

export const memoryStore: Store = {
  async createConversation(init = {}) {
    const conversation: Conversation = {
      ...EMPTY_LEAD,
      name: init.name ?? null,
      whatsapp: init.whatsapp ?? null,
      id: randomUUID(),
      channel: init.channel ?? "web",
      externalUserId: init.externalUserId ?? null,
      visitorToken: randomUUID(),
      createdAt: now(),
      updatedAt: now(),
      mode: "ai",
      stage: "new",
      score: 0,
      handoffReason: null,
      unreadForStaff: false,
      apiHistory: [],
    };
    db.conversations.set(conversation.id, conversation);
    return structuredClone(conversation);
  },

  async getConversation(id) {
    const c = db.conversations.get(id);
    return c ? structuredClone(c) : null;
  },

  async findConversationByExternalUser(channel, externalUserId) {
    const c = [...db.conversations.values()].find(
      (x) => x.channel === channel && x.externalUserId === externalUserId,
    );
    return c ? structuredClone(c) : null;
  },

  async listConversations() {
    return [...db.conversations.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => structuredClone(c));
  },

  async updateConversation(id, patch) {
    const c = db.conversations.get(id);
    if (!c) return;
    Object.assign(c, patch, { updatedAt: now() });
  },

  async appendApiHistory(id, entries) {
    const c = db.conversations.get(id);
    if (!c) return;
    c.apiHistory.push(...structuredClone(entries));
    c.updatedAt = now();
  },

  async addMessage(conversationId, role, text) {
    const message: DisplayMessage = {
      id: randomUUID(),
      conversationId,
      createdAt: now(),
      role,
      text,
      syncedToAi: role !== "staff",
    };
    db.messages.push(message);
    const c = db.conversations.get(conversationId);
    if (c) c.updatedAt = message.createdAt;
    return { ...message };
  },

  async listMessages(conversationId, afterIso) {
    return db.messages
      .filter((m) => m.conversationId === conversationId && (!afterIso || m.createdAt > afterIso))
      .map((m) => ({ ...m }));
  },

  async listUnsyncedStaffMessages(conversationId) {
    return db.messages
      .filter((m) => m.conversationId === conversationId && !m.syncedToAi)
      .map((m) => ({ ...m }));
  },

  async markStaffMessagesSynced(ids) {
    const set = new Set(ids);
    db.messages.forEach((m) => {
      if (set.has(m.id)) m.syncedToAi = true;
    });
  },

  async claimEvent(id) {
    if (db.events.has(id)) return false;
    db.events.add(id);
    return true;
  },
};
