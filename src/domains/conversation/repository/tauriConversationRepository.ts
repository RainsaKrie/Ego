import { invokeBackend, hasTauriBackend } from '../../../shared/infra/tauri'
import { Conversation } from '../../../shared/types/domain'
import { mockConversationRepository } from './mockConversationRepository'

export const tauriConversationRepository = {
  async createConversation(title?: string): Promise<Conversation> {
    if (!hasTauriBackend()) {
      return mockConversationRepository.createConversation(title)
    }

    return invokeBackend<Conversation>('create_conversation', { title })
  },
}
