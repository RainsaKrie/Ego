export type Conversation = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type MemoryPolicy = 'none' | 'recent-window' | 'summary-plus-recent'

export type MessageRole = 'system' | 'user' | 'assistant'

export type MessageStatus = 'idle' | 'sent' | 'streaming' | 'interrupted' | 'error'

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: string
}

export type RequestStatus = 'pending' | 'completed' | 'failed' | 'cancelled'

export type RequestRecord = {
  id: string
  conversationId: string
  status: RequestStatus
  startedAt: string
  finishedAt?: string | null
  model: string
  memoryPolicy: MemoryPolicy
}

export type UsageSource = 'provider-reported' | 'locally-estimated' | 'unknown'

export type UsageSnapshot = {
  requestId: string
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  latencyMs?: number | null
  estimatedCostUsd?: number | null
  usageSource: UsageSource
}

export type LatestRequestSummary = {
  status: 'idle' | 'pending' | 'completed' | 'failed' | 'cancelled'
  conversationId?: string | null
  requestId?: string | null
  model?: string | null
  memoryPolicy?: MemoryPolicy | null
  requestCount: number
  promptTokens?: number | null
  completionTokens?: number | null
  requestTotalTokens?: number | null
  cumulativeTotalTokens: number
  latencyMs: number
  estimatedCostUsd: number
  usageSource: UsageSource
  startedAt?: string | null
  finishedAt?: string | null
  errorMessage?: string | null
}

export type SettingsSnapshot = {
  baseUrl: string
  model: string
  temperature: number
  topP: number
  maxOutputTokens: number
  memoryPolicy: MemoryPolicy
  hasApiKey: boolean
  pricePreset: 'builtin'
  activeProviderId: string
  providerProfiles: ProviderProfile[]
}

export type AvailableModelsResult = {
  models: string[]
}

export type ProviderProfile = {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  temperature: number
  topP: number
  maxOutputTokens: number
  memoryPolicy: MemoryPolicy
  enabled: boolean
  hasApiKey: boolean
  discoveredModels: string[]
}

export type ConversationSettingsSnapshot = {
  conversationId: string
  model: string
  temperature: number
  topP: number
  maxOutputTokens: number
  memoryPolicy: MemoryPolicy
  inheritsDefault: boolean
}

export type WorkspaceBootstrap = {
  settings: SettingsSnapshot
  conversations: Conversation[]
  messagesByConversationId: Record<string, Message[]>
  conversationSettingsById: Record<string, ConversationSettingsSnapshot>
  latestRequest: LatestRequestSummary
}

export type SendMessageResult = {
  userMessage: Message
  assistantMessage?: Message | null
  latestRequest: LatestRequestSummary
  conversationUpdatedAt: string
}

export type RetryMessageResult = {
  promptMessage: Message
  assistantMessage?: Message | null
  latestRequest: LatestRequestSummary
  conversationUpdatedAt: string
}

export type StreamingAssistantMessage = {
  requestId: string
  conversationId: string
  model: string
  content: string
  startedAt: string
}

export type StreamChunkEvent = {
  conversationId: string
  requestId: string
  deltaText: string
  accumulatedText: string
  model: string
}

export type StreamCompletedEvent = {
  conversationId: string
  requestId: string
  assistantMessageId: string
  fullText: string
}

export type StreamFailedEvent = {
  conversationId: string
  requestId: string
  errorMessage: string
}

export type StreamCancelledEvent = {
  conversationId: string
  requestId: string
}
