import { create } from 'zustand'
import { SettingsSnapshot } from '../../../shared/types/domain'
import { workspaceRepository } from '../../workspace/repository/workspaceRepository'
import { useConversationStore } from '../../conversation/store/useConversationStore'

export type SettingsDraft = Omit<SettingsSnapshot, 'hasApiKey' | 'pricePreset'>

type SettingsState = {
  settings: SettingsSnapshot
  isSaving: boolean
  bootstrap: () => Promise<void>
  setSettings: (settings: SettingsSnapshot) => void
  saveSettings: (settings: SettingsDraft) => Promise<void>
  saveApiKey: (apiKey: string) => Promise<void>
  clearApiKey: () => Promise<void>
}

const defaultSettings: SettingsSnapshot = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  temperature: 0.7,
  topP: 1,
  maxOutputTokens: 1024,
  memoryPolicy: 'recent-window',
  hasApiKey: false,
  pricePreset: 'builtin',
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isSaving: false,
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
  async saveApiKey(apiKey) {
    set({ isSaving: true })

    try {
      await workspaceRepository.setApiKey(apiKey)
      set((state) => ({
        settings: {
          ...state.settings,
          hasApiKey: true,
        },
        isSaving: false,
      }))
    } catch (error) {
      set({ isSaving: false })
      throw error
    }
  },
  async clearApiKey() {
    set({ isSaving: true })

    try {
      await workspaceRepository.clearApiKey()
      set((state) => ({
        settings: {
          ...state.settings,
          hasApiKey: false,
        },
        isSaving: false,
      }))
    } catch (error) {
      set({ isSaving: false })
      throw error
    }
  },
}))
