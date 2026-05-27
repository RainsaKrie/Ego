import { create } from 'zustand'
import {
  Conversation,
  ConversationSettingsSnapshot,
  Message,
  SettingsSnapshot,
  StreamCancelledEvent,
  StreamChunkEvent,
  StreamCompletedEvent,
  StreamFailedEvent,
  StreamingAssistantMessage,
} from '../../../shared/types/domain'
import { listenBackendEvent } from '../../../shared/infra/tauri'
import { conversationService } from '../services/conversationService'
import { useWorkspaceRuntimeStore } from '../../workspace/store/useWorkspaceRuntimeStore'
import { useSettingsStore } from '../../settings/store/useSettingsStore'
import { useObservabilityStore } from '../../observability/store/useObservabilityStore'

const STREAM_CHUNK_EVENT = 'conversation://stream-chunk'
const STREAM_COMPLETED_EVENT = 'conversation://stream-completed'
const STREAM_FAILED_EVENT = 'conversation://stream-failed'
const STREAM_CANCELLED_EVENT = 'conversation://stream-cancelled'

type ConversationState = {
  conversations: Conversation[]
  messagesByConversationId: Record<string, Message[]>
  conversationSettingsById: Record<string, ConversationSettingsSnapshot>
  streamingMessagesByConversationId: Record<string, StreamingAssistantMessage>
  activeConversationId: string | null
  isBootstrapped: boolean
  isStreamingBridgeReady: boolean
  isSending: boolean
  isStopping: boolean
  sendError: string | null
  isSavingEnvironment: boolean
  initializeStreamingBridge: () => Promise<void>
  clearStreamingMessage: (conversationId: string) => void
  syncInheritedConversationSettings: (settings: SettingsSnapshot) => void
  bootstrap: () => Promise<void>
  selectConversation: (conversationId: string) => void
  createConversation: () => Promise<void>
  deleteConversation: (conversationId: string) => Promise<void>
  saveConversationSettings: (
    settings: Omit<ConversationSettingsSnapshot, 'conversationId' | 'inheritsDefault'>,
  ) => Promise<void>
  resetConversationSettings: () => Promise<void>
  sendMessage: (content: string) => Promise<void>
  stopMessage: () => Promise<void>
  retryLatestFailedMessage: () => Promise<void>
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  messagesByConversationId: {},
  conversationSettingsById: {},
  streamingMessagesByConversationId: {},
  activeConversationId: null,
  isBootstrapped: false,
  isStreamingBridgeReady: false,
  isSending: false,
  isStopping: false,
  sendError: null,
  isSavingEnvironment: false,
  async initializeStreamingBridge() {
    if (get().isStreamingBridgeReady) {
      return
    }

    const [unlistenChunk, unlistenCompleted, unlistenFailed, unlistenCancelled] = await Promise.all([
      listenBackendEvent<StreamChunkEvent>(STREAM_CHUNK_EVENT, (payload) => {
        set((state) => {
          const previousMessages = state.messagesByConversationId[payload.conversationId] ?? []
          const latestKnownMessage =
            previousMessages.length > 0
              ? previousMessages[previousMessages.length - 1]
              : null

          return {
            streamingMessagesByConversationId: {
              ...state.streamingMessagesByConversationId,
              [payload.conversationId]: {
                requestId: payload.requestId,
                conversationId: payload.conversationId,
                model: payload.model,
                content: payload.accumulatedText,
                startedAt:
                  state.streamingMessagesByConversationId[payload.conversationId]?.startedAt ??
                  latestKnownMessage?.createdAt ??
                  new Date().toISOString(),
              },
            },
          }
        })

        const currentLatestRequest = useObservabilityStore.getState().latestRequest
        useObservabilityStore.getState().setLatestRequest({
          ...currentLatestRequest,
          status: 'pending',
          conversationId: payload.conversationId,
          requestId: payload.requestId,
          model: payload.model,
          errorMessage: null,
          finishedAt: null,
        })
      }),
      listenBackendEvent<StreamCompletedEvent>(STREAM_COMPLETED_EVENT, (payload) => {
        get().clearStreamingMessage(payload.conversationId)
      }),
      listenBackendEvent<StreamFailedEvent>(STREAM_FAILED_EVENT, (payload) => {
        get().clearStreamingMessage(payload.conversationId)
        const currentLatestRequest = useObservabilityStore.getState().latestRequest
        useObservabilityStore.getState().setLatestRequest({
          ...currentLatestRequest,
          status: 'failed',
          conversationId: payload.conversationId,
          requestId: payload.requestId,
          errorMessage: payload.errorMessage,
        })
        set({ isStopping: false })
      }),
      listenBackendEvent<StreamCancelledEvent>(STREAM_CANCELLED_EVENT, (payload) => {
        get().clearStreamingMessage(payload.conversationId)
        const currentLatestRequest = useObservabilityStore.getState().latestRequest
        useObservabilityStore.getState().setLatestRequest({
          ...currentLatestRequest,
          status: 'cancelled',
          conversationId: payload.conversationId,
          requestId: payload.requestId,
          errorMessage: null,
          finishedAt: new Date().toISOString(),
        })
        set({
          isSending: false,
          isStopping: false,
          sendError: null,
        })
      }),
    ])

    void [unlistenChunk, unlistenCompleted, unlistenFailed, unlistenCancelled]
    set({ isStreamingBridgeReady: true })
  },
  clearStreamingMessage(conversationId) {
    set((state) => {
      if (!state.streamingMessagesByConversationId[conversationId]) {
        return state
      }

      const nextStreamingMessagesByConversationId = {
        ...state.streamingMessagesByConversationId,
      }
      delete nextStreamingMessagesByConversationId[conversationId]

      return {
        streamingMessagesByConversationId: nextStreamingMessagesByConversationId,
      }
    })
  },
  syncInheritedConversationSettings(settings) {
    set((state) => {
      const nextConversationSettingsById = Object.fromEntries(
        Object.entries(state.conversationSettingsById).map(
          ([conversationId, conversationSettings]) => {
            if (!conversationSettings.inheritsDefault) {
              return [conversationId, conversationSettings]
            }

            return [
              conversationId,
              {
                ...conversationSettings,
                model: settings.model,
                temperature: settings.temperature,
                topP: settings.topP,
                maxOutputTokens: settings.maxOutputTokens,
                memoryPolicy: settings.memoryPolicy,
                inheritsDefault: true,
              },
            ]
          },
        ),
      ) as Record<string, ConversationSettingsSnapshot>

      return {
        conversationSettingsById: nextConversationSettingsById,
      }
    })
  },
  async bootstrap() {
    if (get().isBootstrapped) {
      return
    }

    await get().initializeStreamingBridge()
    const snapshot = await conversationService.getWorkspaceSnapshot()
    const fallbackConversationId = snapshot.conversations[0]?.id ?? null
    const runtimeConversationId = useWorkspaceRuntimeStore.getState().activeConversationId

    set({
      conversations: snapshot.conversations,
      messagesByConversationId: snapshot.messagesByConversationId,
      conversationSettingsById: snapshot.conversationSettingsById,
      activeConversationId: runtimeConversationId ?? fallbackConversationId,
      isBootstrapped: true,
    })

    useSettingsStore.getState().setSettings(snapshot.settings)
    useObservabilityStore.getState().setLatestRequest(snapshot.latestRequest)

    if (!runtimeConversationId && fallbackConversationId) {
      useWorkspaceRuntimeStore.getState().setActiveConversation(fallbackConversationId)
    }
  },
  selectConversation(conversationId) {
    set({ activeConversationId: conversationId })
    useWorkspaceRuntimeStore.getState().setActiveConversation(conversationId)
  },
  async createConversation() {
    const nextConversation = await conversationService.createConversation()

    set((state) => ({
      conversations: [nextConversation, ...state.conversations],
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [nextConversation.id]: [],
      },
      conversationSettingsById: {
        ...state.conversationSettingsById,
        [nextConversation.id]: {
          conversationId: nextConversation.id,
          model: useSettingsStore.getState().settings.model,
          temperature: useSettingsStore.getState().settings.temperature,
          topP: useSettingsStore.getState().settings.topP,
          maxOutputTokens: useSettingsStore.getState().settings.maxOutputTokens,
          memoryPolicy: useSettingsStore.getState().settings.memoryPolicy,
          inheritsDefault: true,
        },
      },
      activeConversationId: nextConversation.id,
    }))

    useWorkspaceRuntimeStore.getState().setActiveConversation(nextConversation.id)
  },
  async deleteConversation(conversationId) {
    const snapshot = await conversationService.deleteConversation(conversationId)
    const currentActiveConversationId = get().activeConversationId
    const currentActiveConversationStillExists = snapshot.conversations.some(
      (conversation) => conversation.id === currentActiveConversationId,
    )
    const nextActiveConversationId = currentActiveConversationStillExists
      ? currentActiveConversationId
      : snapshot.conversations[0]?.id ?? null

    set((state) => {
      return {
        conversations: snapshot.conversations,
        messagesByConversationId: snapshot.messagesByConversationId,
        conversationSettingsById: snapshot.conversationSettingsById,
        streamingMessagesByConversationId: Object.fromEntries(
          Object.entries(state.streamingMessagesByConversationId).filter(
            ([streamConversationId]) => streamConversationId !== conversationId,
          ),
        ),
        activeConversationId: nextActiveConversationId,
      }
    })

    useSettingsStore.getState().setSettings(snapshot.settings)
    useObservabilityStore.getState().setLatestRequest(snapshot.latestRequest)
    useWorkspaceRuntimeStore.getState().setActiveConversation(nextActiveConversationId)
  },
  async saveConversationSettings(settings) {
    const conversationId = get().activeConversationId

    if (!conversationId) {
      return
    }

    set({ isSavingEnvironment: true })

    try {
      const saved = await conversationService.saveConversationSettings(
        conversationId,
        settings,
      )
      set((state) => ({
        conversationSettingsById: {
          ...state.conversationSettingsById,
          [conversationId]: saved,
        },
        isSavingEnvironment: false,
      }))
    } catch (error) {
      set({ isSavingEnvironment: false })
      throw error
    }
  },
  async resetConversationSettings() {
    const conversationId = get().activeConversationId

    if (!conversationId) {
      return
    }

    set({ isSavingEnvironment: true })

    try {
      const reset = await conversationService.resetConversationSettings(conversationId)
      set((state) => ({
        conversationSettingsById: {
          ...state.conversationSettingsById,
          [conversationId]: reset,
        },
        isSavingEnvironment: false,
      }))
    } catch (error) {
      set({ isSavingEnvironment: false })
      throw error
    }
  },
  async sendMessage(content) {
    const conversationId = get().activeConversationId
    const trimmedContent = content.trim()

    if (!conversationId || !trimmedContent || get().isSending) {
      return
    }

    set({
      isSending: true,
      sendError: null,
    })
    const now = new Date().toISOString()
    const activeConversationSettings =
      get().conversationSettingsById[conversationId] ?? {
        conversationId,
        model: useSettingsStore.getState().settings.model,
        temperature: useSettingsStore.getState().settings.temperature,
        topP: useSettingsStore.getState().settings.topP,
        maxOutputTokens: useSettingsStore.getState().settings.maxOutputTokens,
        memoryPolicy: useSettingsStore.getState().settings.memoryPolicy,
        inheritsDefault: true,
      }
    const optimisticUserMessage: Message = {
      id: `local-user-${Date.now()}`,
      conversationId,
      role: 'user',
      content: trimmedContent,
      createdAt: now,
    }

    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, updatedAt: now }
          : conversation,
      ),
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: [
          ...(state.messagesByConversationId[conversationId] ?? []),
          optimisticUserMessage,
        ],
      },
      streamingMessagesByConversationId: {
        ...state.streamingMessagesByConversationId,
        [conversationId]: {
          requestId: `pending-${Date.now()}`,
          conversationId,
          model: activeConversationSettings.model,
          content: '',
          startedAt: now,
        },
      },
    }))

    useObservabilityStore.getState().markPending({
      conversationId,
      model: activeConversationSettings.model,
      memoryPolicy: activeConversationSettings.memoryPolicy,
      startedAt: now,
    })

    try {
      const result = await conversationService.sendMessage(conversationId, trimmedContent)

      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, updatedAt: result.conversationUpdatedAt }
            : conversation,
        ),
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [conversationId]: [
            ...(state.messagesByConversationId[conversationId] ?? []).filter(
              (message) => message.id !== optimisticUserMessage.id,
            ),
            result.userMessage,
            ...(result.assistantMessage ? [result.assistantMessage] : []),
          ],
        },
        streamingMessagesByConversationId: Object.fromEntries(
          Object.entries(state.streamingMessagesByConversationId).filter(
            ([streamConversationId]) => streamConversationId !== conversationId,
          ),
        ),
        isSending: false,
        sendError: result.latestRequest.errorMessage ?? null,
      }))

      useObservabilityStore.getState().setLatestRequest(result.latestRequest)
      set({ isStopping: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败'
      set({
        isSending: false,
        isStopping: false,
        sendError: message,
      })
      get().clearStreamingMessage(conversationId)
      useObservabilityStore.getState().setLatestRequest({
        ...useObservabilityStore.getState().latestRequest,
        status: 'failed',
        errorMessage: message,
      })
    }
  },
  async stopMessage() {
    const conversationId = get().activeConversationId

    if (!conversationId || !get().isSending || get().isStopping) {
      return
    }

    set({ isStopping: true })

    try {
      await conversationService.stopStreaming(conversationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : '中止失败'
      set({
        isStopping: false,
        sendError: message,
      })
    }
  },
  async retryLatestFailedMessage() {
    const conversationId = get().activeConversationId
    const latestRequest = useObservabilityStore.getState().latestRequest

    if (
      !conversationId ||
      get().isSending ||
      latestRequest.status !== 'failed' ||
      latestRequest.conversationId !== conversationId
    ) {
      return
    }

    set({
      isSending: true,
      isStopping: false,
      sendError: null,
      streamingMessagesByConversationId: {
        ...get().streamingMessagesByConversationId,
        [conversationId]: {
          requestId: latestRequest.requestId ?? `retry-${Date.now()}`,
          conversationId,
          model: latestRequest.model ?? useSettingsStore.getState().settings.model,
          content: '',
          startedAt: new Date().toISOString(),
        },
      },
    })

    useObservabilityStore.getState().markPending({
      conversationId,
      model: latestRequest.model ?? useSettingsStore.getState().settings.model,
      memoryPolicy:
        latestRequest.memoryPolicy ?? useSettingsStore.getState().settings.memoryPolicy,
      startedAt: new Date().toISOString(),
    })

    try {
      const result = await conversationService.retryLatestFailedRequest(conversationId)

      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, updatedAt: result.conversationUpdatedAt }
            : conversation,
        ),
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [conversationId]: [
            ...(state.messagesByConversationId[conversationId] ?? []),
            ...(result.assistantMessage ? [result.assistantMessage] : []),
          ],
        },
        streamingMessagesByConversationId: Object.fromEntries(
          Object.entries(state.streamingMessagesByConversationId).filter(
            ([streamConversationId]) => streamConversationId !== conversationId,
          ),
        ),
        isSending: false,
        isStopping: false,
        sendError: result.latestRequest.errorMessage ?? null,
      }))

      useObservabilityStore.getState().setLatestRequest(result.latestRequest)
    } catch (error) {
      const message = error instanceof Error ? error.message : '重试失败'
      set({
        isSending: false,
        isStopping: false,
        sendError: message,
      })
      get().clearStreamingMessage(conversationId)
      useObservabilityStore.getState().setLatestRequest({
        ...useObservabilityStore.getState().latestRequest,
        status: 'failed',
        conversationId,
        errorMessage: message,
      })
    }
  },
}))
