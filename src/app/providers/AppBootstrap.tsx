import { PropsWithChildren, useEffect } from 'react'
import { useConversationStore } from '../../domains/conversation/store/useConversationStore'
import { useObservabilityStore } from '../../domains/observability/store/useObservabilityStore'
import { useSettingsStore } from '../../domains/settings/store/useSettingsStore'

export function AppBootstrap({ children }: PropsWithChildren) {
  const bootstrapConversations = useConversationStore((state) => state.bootstrap)
  const bootstrapObservability = useObservabilityStore((state) => state.bootstrap)
  const bootstrapSettings = useSettingsStore((state) => state.bootstrap)

  useEffect(() => {
    void bootstrapConversations()
    void bootstrapObservability()
    void bootstrapSettings()
  }, [bootstrapConversations, bootstrapObservability, bootstrapSettings])

  return <>{children}</>
}
