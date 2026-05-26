import { create } from 'zustand'
import { LatestRequestSummary } from '../../../shared/types/domain'

type PendingRequestSnapshot = {
  conversationId: string
  model: string
  memoryPolicy: NonNullable<LatestRequestSummary['memoryPolicy']>
  startedAt: string
}

type ObservabilityState = {
  latestRequest: LatestRequestSummary
  bootstrap: () => Promise<void>
  setLatestRequest: (latestRequest: LatestRequestSummary) => void
  markPending: (snapshot: PendingRequestSnapshot) => void
}

const initialLatestRequest: LatestRequestSummary = {
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
}

export const useObservabilityStore = create<ObservabilityState>((set, get) => ({
  latestRequest: initialLatestRequest,
  async bootstrap() {
    if (get().latestRequest.status === 'idle' && get().latestRequest.requestCount === 0) {
      set({ latestRequest: initialLatestRequest })
    }
  },
  setLatestRequest(latestRequest) {
    set({ latestRequest })
  },
  markPending(snapshot) {
    set((state) => ({
      latestRequest: {
        ...state.latestRequest,
        status: 'pending',
        conversationId: snapshot.conversationId,
        requestId: null,
        model: snapshot.model,
        memoryPolicy: snapshot.memoryPolicy,
        promptTokens: null,
        completionTokens: null,
        requestTotalTokens: null,
        latencyMs: 0,
        estimatedCostUsd: 0,
        usageSource: 'unknown',
        startedAt: snapshot.startedAt,
        errorMessage: null,
        finishedAt: null,
      },
    }))
  },
}))
