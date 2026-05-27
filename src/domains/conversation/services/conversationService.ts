import { workspaceRepository } from '../../workspace/repository/workspaceRepository'
import { tauriConversationRepository } from '../repository/tauriConversationRepository'

export const conversationService = {
  async getWorkspaceSnapshot() {
    return workspaceRepository.bootstrapWorkspace()
  },
  async createConversation(title?: string) {
    return tauriConversationRepository.createConversation(title)
  },
  async deleteConversation(conversationId: string) {
    return tauriConversationRepository.deleteConversation(conversationId)
  },
  async saveConversationSettings(
    conversationId: string,
    settings: {
      model: string
      temperature: number
      topP: number
      maxOutputTokens: number
      memoryPolicy: 'none' | 'recent-window' | 'summary-plus-recent'
    },
  ) {
    return workspaceRepository.saveConversationSettings(conversationId, settings)
  },
  async resetConversationSettings(conversationId: string) {
    return workspaceRepository.resetConversationSettings(conversationId)
  },
  async sendMessage(conversationId: string, content: string) {
    return workspaceRepository.sendMessage(conversationId, content)
  },
  async retryLatestFailedRequest(conversationId: string) {
    return workspaceRepository.retryLatestFailedRequest(conversationId)
  },
  async stopStreaming(conversationId: string) {
    return workspaceRepository.stopStreaming(conversationId)
  },
}
