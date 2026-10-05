import type { ApiMessage, Conversation, DisplayMessage, DisplayRole, LeadFields, Mode, Stage } from "../types";

export type ConversationPatch = Partial<LeadFields> & {
  mode?: Mode;
  stage?: Stage;
  score?: number;
  handoffReason?: string | null;
  unreadForStaff?: boolean;
};

export interface Store {
  createConversation(): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(): Promise<Conversation[]>;
  updateConversation(id: string, patch: ConversationPatch): Promise<void>;
  appendApiHistory(id: string, entries: ApiMessage[]): Promise<void>;

  addMessage(conversationId: string, role: DisplayRole, text: string): Promise<DisplayMessage>;
  listMessages(conversationId: string, afterIso?: string): Promise<DisplayMessage[]>;
  // Staff messages written while the AI was paused, not yet seen by the AI.
  listUnsyncedStaffMessages(conversationId: string): Promise<DisplayMessage[]>;
  markStaffMessagesSynced(ids: string[]): Promise<void>;
}
