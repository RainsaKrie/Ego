import { Conversation, Message, WorkspaceBootstrap } from '../../../shared/types/domain'

export type ConversationRepository = {
  listConversations: () => Promise<Conversation[]>
  listMessages: (conversationId: string) => Promise<Message[]>
  createConversation: (title?: string) => Promise<Conversation>
  deleteConversation: (conversationId: string) => Promise<WorkspaceBootstrap>
}
