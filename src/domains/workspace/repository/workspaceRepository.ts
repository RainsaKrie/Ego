import { invokeBackend, hasTauriBackend } from '../../../shared/infra/tauri'
import {
  AvailableModelsResult,
  ConversationSettingsSnapshot,
  ProviderProfile,
  RetryMessageResult,
  SendMessageResult,
  SettingsSnapshot,
  WorkspaceBootstrap,
} from '../../../shared/types/domain'
import { mockWorkspaceBootstrap } from './mockWorkspaceBootstrap'

export const workspaceRepository = {
  async bootstrapWorkspace(): Promise<WorkspaceBootstrap> {
    if (!hasTauriBackend()) {
      return mockWorkspaceBootstrap
    }

    return invokeBackend<WorkspaceBootstrap>('bootstrap_workspace')
  },
  async saveSettings(settings: {
    baseUrl: string
    model: string
    temperature: number
    topP: number
    maxOutputTokens: number
    memoryPolicy: SettingsSnapshot['memoryPolicy']
  }) {
    if (!hasTauriBackend()) {
      const providerProfiles = mockWorkspaceBootstrap.settings.providerProfiles.map((profile) =>
        profile.id === mockWorkspaceBootstrap.settings.activeProviderId
          ? {
              ...profile,
              baseUrl: settings.baseUrl,
              defaultModel: settings.model,
              temperature: settings.temperature,
              topP: settings.topP,
              maxOutputTokens: settings.maxOutputTokens,
              memoryPolicy: settings.memoryPolicy,
            }
          : profile,
      )
      mockWorkspaceBootstrap.settings = {
        ...mockWorkspaceBootstrap.settings,
        ...settings,
        providerProfiles,
      }

      return mockWorkspaceBootstrap.settings
    }

    return invokeBackend<SettingsSnapshot>('save_global_settings', {
      input: settings,
    })
  },
  async saveProviderProfiles(
    providerProfiles: ProviderProfile[],
    activeProviderId: string,
  ) {
    if (!hasTauriBackend()) {
      mockWorkspaceBootstrap.settings.providerProfiles = providerProfiles
      mockWorkspaceBootstrap.settings.activeProviderId = activeProviderId
      const activeProvider =
        providerProfiles.find((profile) => profile.id === activeProviderId) ??
        providerProfiles[0]

      mockWorkspaceBootstrap.settings = {
        ...mockWorkspaceBootstrap.settings,
        baseUrl: activeProvider.baseUrl,
        model: activeProvider.defaultModel,
        temperature: activeProvider.temperature,
        topP: activeProvider.topP,
        maxOutputTokens: activeProvider.maxOutputTokens,
        memoryPolicy: activeProvider.memoryPolicy,
        hasApiKey: activeProvider.hasApiKey,
        activeProviderId,
        providerProfiles,
      }

      return mockWorkspaceBootstrap.settings
    }

    return invokeBackend<SettingsSnapshot>('save_provider_profiles', {
      input: {
        activeProviderId,
        providerProfiles,
      },
    })
  },
  async fetchAvailableModels(
    providerId: string,
    baseUrl: string,
  ): Promise<AvailableModelsResult> {
    if (!hasTauriBackend()) {
      return {
        models: [
          'gpt-4.1-mini',
          'gpt-4.1',
          'gpt-4o-mini',
          'gpt-4o',
          'gemini-3.1-pro-preview',
        ],
      }
    }

    const models = await invokeBackend<string[]>('fetch_available_models', {
      providerId,
      baseUrl,
    })
    return { models }
  },
  async setApiKey(providerId: string, apiKey: string) {
    if (!hasTauriBackend()) {
      mockWorkspaceBootstrap.settings.providerProfiles =
        mockWorkspaceBootstrap.settings.providerProfiles.map((profile) =>
          profile.id === providerId ? { ...profile, hasApiKey: true } : profile,
        )
      if (mockWorkspaceBootstrap.settings.activeProviderId === providerId) {
        mockWorkspaceBootstrap.settings.hasApiKey = true
      }
      return
    }

    await invokeBackend('set_api_key', { providerId, apiKey })
  },
  async clearApiKey(providerId: string) {
    if (!hasTauriBackend()) {
      mockWorkspaceBootstrap.settings.providerProfiles =
        mockWorkspaceBootstrap.settings.providerProfiles.map((profile) =>
          profile.id === providerId ? { ...profile, hasApiKey: false } : profile,
        )
      if (mockWorkspaceBootstrap.settings.activeProviderId === providerId) {
        mockWorkspaceBootstrap.settings.hasApiKey = false
      }
      return
    }

    await invokeBackend('clear_api_key', { providerId })
  },
  async saveConversationSettings(
    conversationId: string,
    settings: Omit<ConversationSettingsSnapshot, 'conversationId' | 'inheritsDefault'>,
  ) {
    if (!hasTauriBackend()) {
      mockWorkspaceBootstrap.conversationSettingsById[conversationId] = {
        conversationId,
        ...settings,
        inheritsDefault: false,
      }

      return mockWorkspaceBootstrap.conversationSettingsById[conversationId]
    }

    return invokeBackend<ConversationSettingsSnapshot>('save_conversation_settings', {
      conversationId,
      input: settings,
    })
  },
  async resetConversationSettings(conversationId: string) {
    if (!hasTauriBackend()) {
      mockWorkspaceBootstrap.conversationSettingsById[conversationId] = {
        conversationId,
        model: mockWorkspaceBootstrap.settings.model,
        temperature: mockWorkspaceBootstrap.settings.temperature,
        topP: mockWorkspaceBootstrap.settings.topP,
        maxOutputTokens: mockWorkspaceBootstrap.settings.maxOutputTokens,
        memoryPolicy: mockWorkspaceBootstrap.settings.memoryPolicy,
        inheritsDefault: true,
      }

      return mockWorkspaceBootstrap.conversationSettingsById[conversationId]
    }

    return invokeBackend<ConversationSettingsSnapshot>('reset_conversation_settings', {
      conversationId,
    })
  },
  async sendMessage(conversationId: string, content: string): Promise<SendMessageResult> {
    if (!hasTauriBackend()) {
      const now = new Date().toISOString()
      const requestId = `req-${Date.now()}`
      const conversationSettings =
        mockWorkspaceBootstrap.conversationSettingsById[conversationId] ?? {
          conversationId,
          model: mockWorkspaceBootstrap.settings.model,
          temperature: mockWorkspaceBootstrap.settings.temperature,
          topP: mockWorkspaceBootstrap.settings.topP,
          maxOutputTokens: mockWorkspaceBootstrap.settings.maxOutputTokens,
          memoryPolicy: mockWorkspaceBootstrap.settings.memoryPolicy,
          inheritsDefault: true,
        }
      const userMessage = {
        id: `msg-${Date.now()}`,
        conversationId,
        role: 'user' as const,
        content,
        createdAt: now,
      }
      const assistantMessage = {
        id: `msg-${Date.now() + 1}`,
        conversationId,
        role: 'assistant' as const,
        content: `Mock provider 已收到：${content}`,
        createdAt: now,
      }

      mockWorkspaceBootstrap.messagesByConversationId[conversationId] = [
        ...(mockWorkspaceBootstrap.messagesByConversationId[conversationId] ?? []),
        userMessage,
        assistantMessage,
      ]

      mockWorkspaceBootstrap.latestRequest = {
        status: 'completed',
        conversationId,
        requestId,
        model: conversationSettings.model,
        memoryPolicy: conversationSettings.memoryPolicy,
        requestCount: mockWorkspaceBootstrap.latestRequest.requestCount + 1,
        promptTokens: Math.max(8, Math.ceil(content.length / 2)),
        completionTokens: 12,
        requestTotalTokens: Math.max(12, content.length),
        cumulativeTotalTokens:
          mockWorkspaceBootstrap.latestRequest.cumulativeTotalTokens +
          Math.max(12, content.length),
        latencyMs: 180,
        estimatedCostUsd: 0,
        usageSource: 'unknown',
        startedAt: now,
        finishedAt: now,
        errorMessage: null,
      }

      return {
        userMessage,
        assistantMessage,
        latestRequest: mockWorkspaceBootstrap.latestRequest,
        conversationUpdatedAt: now,
      }
    }

    return invokeBackend<SendMessageResult>('send_message', {
      input: { conversationId, content },
    })
  },
  async retryLatestFailedRequest(conversationId: string): Promise<RetryMessageResult> {
    if (!hasTauriBackend()) {
      const now = new Date().toISOString()
      const conversationSettings =
        mockWorkspaceBootstrap.conversationSettingsById[conversationId] ?? {
          conversationId,
          model: mockWorkspaceBootstrap.settings.model,
          temperature: mockWorkspaceBootstrap.settings.temperature,
          topP: mockWorkspaceBootstrap.settings.topP,
          maxOutputTokens: mockWorkspaceBootstrap.settings.maxOutputTokens,
          memoryPolicy: mockWorkspaceBootstrap.settings.memoryPolicy,
          inheritsDefault: true,
        }
      const promptMessage =
        [...(mockWorkspaceBootstrap.messagesByConversationId[conversationId] ?? [])]
          .reverse()
          .find((message) => message.role === 'user') ?? {
          id: `msg-${Date.now()}`,
          conversationId,
          role: 'user' as const,
          content: '重试',
          createdAt: now,
        }
      const assistantMessage = {
        id: `msg-${Date.now() + 1}`,
        conversationId,
        role: 'assistant' as const,
        content: `Mock provider 重试完成：${promptMessage.content}`,
        createdAt: now,
      }

      mockWorkspaceBootstrap.messagesByConversationId[conversationId] = [
        ...(mockWorkspaceBootstrap.messagesByConversationId[conversationId] ?? []),
        assistantMessage,
      ]

      mockWorkspaceBootstrap.latestRequest = {
        status: 'completed',
        conversationId,
        requestId: `req-${Date.now()}`,
        model: conversationSettings.model,
        memoryPolicy: conversationSettings.memoryPolicy,
        requestCount: mockWorkspaceBootstrap.latestRequest.requestCount + 1,
        promptTokens: Math.max(8, Math.ceil(promptMessage.content.length / 2)),
        completionTokens: 12,
        requestTotalTokens: Math.max(12, promptMessage.content.length),
        cumulativeTotalTokens:
          mockWorkspaceBootstrap.latestRequest.cumulativeTotalTokens +
          Math.max(12, promptMessage.content.length),
        latencyMs: 180,
        estimatedCostUsd: 0,
        usageSource: 'unknown',
        startedAt: now,
        finishedAt: now,
        errorMessage: null,
      }

      return {
        promptMessage,
        assistantMessage,
        latestRequest: mockWorkspaceBootstrap.latestRequest,
        conversationUpdatedAt: now,
      }
    }

    return invokeBackend<RetryMessageResult>('retry_latest_failed_request', {
      conversationId,
    })
  },
  async stopStreaming(conversationId: string) {
    if (!hasTauriBackend()) {
      return
    }

    await invokeBackend('stop_streaming', { conversationId })
  },
}
