import { ConversationRepository } from './conversationRepository'
import { Conversation, Message } from '../../../shared/types/domain'

const conversations: Conversation[] = [
  {
    id: 'conv-1',
    title: 'Ego M1 主链拆解',
    createdAt: '2026-05-25T14:00:00.000Z',
    updatedAt: '2026-05-25T14:08:00.000Z',
  },
  {
    id: 'conv-2',
    title: '记忆策略实验记录',
    createdAt: '2026-05-24T09:30:00.000Z',
    updatedAt: '2026-05-24T10:15:00.000Z',
  },
]

const messages: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: '先把 M1 的工程骨架搭起来，后面再补 provider 与 SQLite 主链。',
    createdAt: '2026-05-25T14:01:00.000Z',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    role: 'assistant',
    content: '当前骨架先覆盖工作台、设置、分析页和状态容器边界，优先满足 G1。',
    createdAt: '2026-05-25T14:01:09.000Z',
  },
  {
    id: 'msg-3',
    conversationId: 'conv-2',
    role: 'user',
    content: '摘要记忆和 recent-window 的成本差异后面要能对比。',
    createdAt: '2026-05-24T09:42:00.000Z',
  },
]

export const mockConversationRepository: ConversationRepository = {
  async listConversations() {
    return conversations
  },
  async listMessages(conversationId: string) {
    return messages.filter((message) => message.conversationId === conversationId)
  },
  async createConversation(title) {
    const now = new Date().toISOString()
    const conversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: title?.trim() || '未命名新会话',
      createdAt: now,
      updatedAt: now,
    }

    conversations.unshift(conversation)
    return conversation
  },
}
