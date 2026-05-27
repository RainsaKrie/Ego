import {
  ConversationSettingsSnapshot,
  ProviderProfile,
  SettingsSnapshot,
  WorkspaceBootstrap,
} from '../../../shared/types/domain'

const defaultProvider: ProviderProfile = {
  id: 'provider-default',
  name: '默认服务',
  baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4.1-mini',
  temperature: 0.7,
  topP: 1,
  maxOutputTokens: 1024,
  memoryPolicy: 'recent-window',
  enabled: true,
  hasApiKey: false,
  discoveredModels: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'],
}

const defaultSettings: SettingsSnapshot = {
  baseUrl: defaultProvider.baseUrl,
  model: defaultProvider.defaultModel,
  temperature: defaultProvider.temperature,
  topP: defaultProvider.topP,
  maxOutputTokens: defaultProvider.maxOutputTokens,
  memoryPolicy: defaultProvider.memoryPolicy,
  hasApiKey: false,
  pricePreset: 'builtin',
  activeProviderId: defaultProvider.id,
  providerProfiles: [defaultProvider],
}

function buildDefaultConversationSettings(
  conversationId: string,
): ConversationSettingsSnapshot {
  return {
    conversationId,
    model: defaultSettings.model,
    temperature: defaultSettings.temperature,
    topP: defaultSettings.topP,
    maxOutputTokens: defaultSettings.maxOutputTokens,
    memoryPolicy: defaultSettings.memoryPolicy,
    inheritsDefault: true,
  }
}

export const mockWorkspaceBootstrap: WorkspaceBootstrap = {
  settings: defaultSettings,
  conversations: [
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
  ],
  messagesByConversationId: {
    'conv-1': [
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
    ],
    'conv-2': [
      {
        id: 'msg-3',
        conversationId: 'conv-2',
        role: 'user',
        content: '摘要记忆和 recent-window 的成本差异后面要能对比。',
        createdAt: '2026-05-24T09:42:00.000Z',
      },
    ],
  },
  conversationSettingsById: {
    'conv-1': buildDefaultConversationSettings('conv-1'),
    'conv-2': buildDefaultConversationSettings('conv-2'),
  },
  latestRequest: {
    status: 'idle',
    conversationId: null,
    requestId: null,
    model: null,
    memoryPolicy: null,
    requestCount: 0,
    promptTokens: null,
    completionTokens: null,
    requestTotalTokens: null,
    cumulativeTotalTokens: 0,
    latencyMs: 0,
    estimatedCostUsd: 0,
    usageSource: 'unknown',
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
  },
}
