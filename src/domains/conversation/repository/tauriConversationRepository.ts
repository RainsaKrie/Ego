import { invokeBackend, hasTauriBackend } from '../../../shared/infra/tauri'
import { Conversation, WorkspaceBootstrap } from '../../../shared/types/domain'
import { mockConversationRepository } from './mockConversationRepository'

export const tauriConversationRepository = {
  async createConversation(title?: string): Promise<Conversation> {
    if (!hasTauriBackend()) {
      return mockConversationRepository.createConversation(title)
    }

    return invokeBackend<Conversation>('create_conversation', { title })
  },
  async deleteConversation(conversationId: string): Promise<WorkspaceBootstrap> {
    if (!hasTauriBackend()) {
      return mockConversationRepository.deleteConversation(conversationId)
    }

    return invokeBackend<WorkspaceBootstrap>('delete_conversation', { conversationId })
  },
}
