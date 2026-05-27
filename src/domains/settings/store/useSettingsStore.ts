import { create } from 'zustand'
import { ProviderProfile, SettingsSnapshot } from '../../../shared/types/domain'
import { workspaceRepository } from '../../workspace/repository/workspaceRepository'
import { useConversationStore } from '../../conversation/store/useConversationStore'

export type SettingsDraft = {
  baseUrl: string
  model: string
  temperature: number
  topP: number
  maxOutputTokens: number
  memoryPolicy: SettingsSnapshot['memoryPolicy']
}

type SettingsState = {
  settings: SettingsSnapshot
  isSaving: boolean
  isLoadingModels: boolean
  bootstrap: () => Promise<void>
  setSettings: (settings: SettingsSnapshot) => void
  saveSettings: (settings: SettingsDraft) => Promise<void>
  saveProviderProfiles: (
    providerProfiles: ProviderProfile[],
    activeProviderId: string,
  ) => Promise<void>
  saveApiKey: (providerId: string, apiKey: string) => Promise<void>
  clearApiKey: (providerId: string) => Promise<void>
  loadAvailableModels: (providerId: string, baseUrl: string) => Promise<string[]>
  refreshProviderModels: (providerId: string, baseUrl: string) => Promise<string[]>
}

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
  discoveredModels: [],
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

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isSaving: false,
  isLoadingModels: false,
  async bootstrap() {
    if (get().settings.baseUrl !== defaultSettings.baseUrl || get().settings.model !== defaultSettings.model) {
      return
    }

    set({ settings: defaultSettings })
  },
  setSettings(settings) {
    set({ settings })
  },
  async saveSettings(settings) {
    set({ isSaving: true })

    try {
      const saved = await workspaceRepository.saveSettings(settings)
      useConversationStore.getState().syncInheritedConversationSettings(saved)
      set({ settings: saved, isSaving: false })
    } catch (error) {
      set({ isSaving: false })
      throw error
    }
  },
  async saveProviderProfiles(providerProfiles, activeProviderId) {
    set({ isSaving: true })

    try {
      const saved = await workspaceRepository.saveProviderProfiles(
        providerProfiles,
        activeProviderId,
      )
      useConversationStore.getState().syncInheritedConversationSettings(saved)
      set({ settings: saved, isSaving: false })
    } catch (error) {
      set({ isSaving: false })
      throw error
    }
  },
  async saveApiKey(providerId, apiKey) {
    set({ isSaving: true })

    try {
      await workspaceRepository.setApiKey(providerId, apiKey)
      set((state) => ({
        settings: {
          ...state.settings,
          hasApiKey:
            state.settings.activeProviderId === providerId
              ? true
              : state.settings.hasApiKey,
          providerProfiles: state.settings.providerProfiles.map((profile) =>
            profile.id === providerId ? { ...profile, hasApiKey: true } : profile,
          ),
        },
        isSaving: false,
      }))
    } catch (error) {
      set({ isSaving: false })
      throw error
    }
  },
  async clearApiKey(providerId) {
    set({ isSaving: true })

    try {
      await workspaceRepository.clearApiKey(providerId)
      set((state) => ({
        settings: {
          ...state.settings,
          hasApiKey:
            state.settings.activeProviderId === providerId
              ? false
              : state.settings.hasApiKey,
          providerProfiles: state.settings.providerProfiles.map((profile) =>
            profile.id === providerId ? { ...profile, hasApiKey: false } : profile,
          ),
        },
        isSaving: false,
      }))
    } catch (error) {
      set({ isSaving: false })
      throw error
    }
  },
  async loadAvailableModels(providerId, baseUrl) {
    set({ isLoadingModels: true })

    try {
      const result = await workspaceRepository.fetchAvailableModels(
        providerId,
        baseUrl,
      )
      set({ isLoadingModels: false })
      return result.models
    } catch (error) {
      set({ isLoadingModels: false })
      throw error
    }
  },
  async refreshProviderModels(providerId, baseUrl) {
    const models = await get().loadAvailableModels(providerId, baseUrl)
    const providerProfiles = get().settings.providerProfiles.map((profile) =>
      profile.id === providerId
        ? { ...profile, discoveredModels: models }
        : profile,
    )
    await get().saveProviderProfiles(providerProfiles, get().settings.activeProviderId)
    return models
  },
}))
