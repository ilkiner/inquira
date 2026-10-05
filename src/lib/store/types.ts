import type { ApiMessage, Channel, Conversation, DisplayMessage, DisplayRole, LeadFields, Mode, Stage } from "../types";

export type ConversationPatch = Partial<LeadFields> & {
  mode?: Mode;
  stage?: Stage;
  score?: number;
  handoffReason?: string | null;
  unreadForStaff?: boolean;
};

export type NewConversation = {
  channel?: Channel;
  externalUserId?: string | null;
  name?: string | null;
  whatsapp?: string | null;
};

export interface Store {
  createConversation(init?: NewConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  findConversationByExternalUser(channel: Channel, externalUserId: string): Promise<Conversation | null>;
  listConversations(): Promise<Conversation[]>;
  updateConversation(id: string, patch: ConversationPatch): Promise<void>;
  appendApiHistory(id: string, entries: ApiMessage[]): Promise<void>;

  addMessage(conversationId: string, role: DisplayRole, text: string): Promise<DisplayMessage>;
  listMessages(conversationId: string, afterIso?: string): Promise<DisplayMessage[]>;
  // Staff messages written while the AI was paused, not yet seen by the AI.
  listUnsyncedStaffMessages(conversationId: string): Promise<DisplayMessage[]>;
  markStaffMessagesSynced(ids: string[]): Promise<void>;

  // Records an inbound webhook event id. Returns false if it was already seen
  // (providers retry deliveries, and each message must be answered once).
  claimEvent(id: string): Promise<boolean>;
}
