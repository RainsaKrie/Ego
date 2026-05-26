import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MessageStatus } from '../../../shared/types/domain'

type WorkspaceRuntimeState = {
  activeConversationId: string | null
  rightRailCollapsed: boolean
  messageRuntime: Record<string, MessageStatus>
  setActiveConversation: (conversationId: string) => void
  setRightRailCollapsed: (collapsed: boolean) => void
  setMessageRuntimeStatus: (messageId: string, status: MessageStatus) => void
}

function cleanZombieStatuses(
  runtime: Record<string, MessageStatus>,
): Record<string, MessageStatus> {
  return Object.fromEntries(
    Object.entries(runtime).map(([messageId, status]) => {
      if (status === 'streaming') {
        return [messageId, 'interrupted']
      }

      if (status === 'sent') {
        return [messageId, 'error']
      }

      return [messageId, status]
    }),
  )
}

export const useWorkspaceRuntimeStore = create<WorkspaceRuntimeState>()(
  persist(
    (set) => ({
      activeConversationId: null,
      rightRailCollapsed: false,
      messageRuntime: {},
      setActiveConversation(conversationId) {
        set({ activeConversationId: conversationId })
      },
      setRightRailCollapsed(collapsed) {
        set({ rightRailCollapsed: collapsed })
      },
      setMessageRuntimeStatus(messageId, status) {
        set((state) => ({
          messageRuntime: {
            ...state.messageRuntime,
            [messageId]: status,
          },
        }))
      },
    }),
    {
      name: 'ego-workspace-runtime',
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        rightRailCollapsed: state.rightRailCollapsed,
        messageRuntime: state.messageRuntime,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return
        }

        state.messageRuntime = cleanZombieStatuses(state.messageRuntime)
      },
    },
  ),
)
