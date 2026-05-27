import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ProviderProfile } from '../../../shared/types/domain'
import { useSettingsStore } from '../store/useSettingsStore'

function createProviderDraft(index: number): ProviderProfile {
  const providerNumber = index + 1

  return {
    id: `provider-${Date.now()}-${providerNumber}`,
    name: `服务 ${providerNumber}`,
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    temperature: 0.7,
    topP: 1,
    maxOutputTokens: 1024,
    memoryPolicy: 'recent-window',
    enabled: true,
    hasApiKey: false,
    discoveredModels: [],
  }
}

export function GlobalSettingsPage() {
  const settings = useSettingsStore((state) => state.settings)
  const isSaving = useSettingsStore((state) => state.isSaving)
  const isLoadingModels = useSettingsStore((state) => state.isLoadingModels)
  const saveProviderProfiles = useSettingsStore((state) => state.saveProviderProfiles)
  const saveApiKey = useSettingsStore((state) => state.saveApiKey)
  const clearApiKey = useSettingsStore((state) => state.clearApiKey)
  const refreshProviderModels = useSettingsStore((state) => state.refreshProviderModels)

  const [providerProfiles, setProviderProfiles] = useState(settings.providerProfiles)
  const [activeProviderId, setActiveProviderId] = useState(settings.activeProviderId)
  const [selectedProviderId, setSelectedProviderId] = useState(settings.activeProviderId)
  const [apiKey, setApiKey] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    setProviderProfiles(settings.providerProfiles)
    setActiveProviderId(settings.activeProviderId)
    setSelectedProviderId((currentSelectedProviderId) => {
      if (
        settings.providerProfiles.some(
          (profile) => profile.id === currentSelectedProviderId,
        )
      ) {
        return currentSelectedProviderId
      }

      return settings.activeProviderId
    })
  }, [settings])

  const filteredProfiles = useMemo(() => {
    const keyword = serviceSearch.trim().toLowerCase()
    if (!keyword) {
      return providerProfiles
    }

    return providerProfiles.filter((profile) =>
      [profile.name, profile.baseUrl, profile.defaultModel]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [providerProfiles, serviceSearch])

  const selectedProvider =
    providerProfiles.find((profile) => profile.id === selectedProviderId) ??
    providerProfiles[0]

  useEffect(() => {
    if (selectedProvider) {
      return
    }

    const fallbackProvider = filteredProfiles[0] ?? providerProfiles[0]
    if (fallbackProvider) {
      setSelectedProviderId(fallbackProvider.id)
    }
  }, [filteredProfiles, providerProfiles, selectedProvider])

  function updateSelectedProvider(
    updater: (provider: ProviderProfile) => ProviderProfile,
  ) {
    if (!selectedProvider) {
      return
    }

    setProviderProfiles((currentProfiles) =>
      currentProfiles.map((profile) =>
        profile.id === selectedProvider.id ? updater(profile) : profile,
      ),
    )
  }

  async function handleSaveProviderConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await saveProviderProfiles(providerProfiles, activeProviderId)
    setStatusMessage('服务配置已保存。')
  }

  async function handleSaveApiKey() {
    if (!selectedProvider) {
      return
    }

    if (!apiKey.trim()) {
      setStatusMessage('API Key 不能为空。')
      return
    }

    await saveApiKey(selectedProvider.id, apiKey.trim())
    setApiKey('')
    setStatusMessage(`已保存 ${selectedProvider.name} 的 API Key。`)
  }

  async function handleClearApiKey() {
    if (!selectedProvider) {
      return
    }

    await clearApiKey(selectedProvider.id)
    setStatusMessage(`已清除 ${selectedProvider.name} 的 API Key。`)
  }

  async function handleRefreshModels() {
    if (!selectedProvider) {
      return
    }

    try {
      const models = await refreshProviderModels(
        selectedProvider.id,
        selectedProvider.baseUrl.trim(),
      )
      setStatusMessage(
        models.length > 0
          ? `已获取 ${models.length} 个可用模型。`
          : '当前提供方未返回模型列表，可继续手动填写模型名。',
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '获取模型列表失败，可继续手动填写模型名。'
      setStatusMessage(message)
    }
  }

  function handleAddProvider() {
    const nextProvider = createProviderDraft(providerProfiles.length)
    setProviderProfiles((currentProfiles) => [...currentProfiles, nextProvider])
    setSelectedProviderId(nextProvider.id)
    setStatusMessage('已新增一个服务配置，请补全地址和模型。')
  }

  async function handleRemoveProvider() {
    if (!selectedProvider || providerProfiles.length <= 1) {
      return
    }

    const confirmed = window.confirm(`确定删除服务“${selectedProvider.name}”吗？`)

    if (!confirmed) {
      return
    }

    const nextProfiles = providerProfiles.filter(
      (profile) => profile.id !== selectedProvider.id,
    )
    const nextSelectedProvider = nextProfiles[0]
    const nextActiveProviderId =
      selectedProvider.id === activeProviderId
        ? nextSelectedProvider.id
        : activeProviderId

    setProviderProfiles(nextProfiles)
    setSelectedProviderId(nextSelectedProvider.id)
    setActiveProviderId(nextActiveProviderId)
    await saveProviderProfiles(nextProfiles, nextActiveProviderId)
    setStatusMessage(`已删除 ${selectedProvider.name}。`)
  }

  if (!selectedProvider) {
    return (
      <section className="standalone-page">
        <p className="banner-note">当前没有可用服务，请先新增一个服务配置。</p>
      </section>
    )
  }

  const selectedProviderModels = selectedProvider.discoveredModels
  const selectedProviderIsActive = selectedProvider.id === activeProviderId
  const modelListId = `provider-model-list-${selectedProvider.id}`
  const hasModels = selectedProviderModels.length > 0

  return (
    <section className="standalone-page">
      <div className="page-hero">
        <p className="eyebrow">模型服务管理</p>
        <h2>API 服务商</h2>
        <p>把服务地址、凭据、默认模型和自动发现能力收在同一个工作台里，先做最小可用的多服务配置版本。</p>
      </div>

      <div className="provider-console">
        <aside className="provider-sidebar side-card">
          <div className="provider-sidebar-header">
            <h3>服务列表</h3>
            <button
              className="ghost-button"
              type="button"
              onClick={handleAddProvider}
            >
              添加
            </button>
          </div>
          <label className="provider-search">
            <span>搜索服务</span>
            <input
              value={serviceSearch}
              placeholder="按名称、地址或模型搜索"
              onChange={(event) => setServiceSearch(event.target.value)}
            />
          </label>
          <div className="provider-list">
            {filteredProfiles.map((profile) => (
              <button
                key={profile.id}
                className={
                  profile.id === selectedProviderId
                    ? 'provider-list-item active'
                    : 'provider-list-item'
                }
                type="button"
                onClick={() => setSelectedProviderId(profile.id)}
              >
                <div>
                  <strong>{profile.name}</strong>
                  <p>{profile.defaultModel || '未设置默认模型'}</p>
                </div>
                <span className="provider-state">
                  {profile.id === activeProviderId ? '当前' : '可用'}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <form
          className="provider-detail side-card"
          onSubmit={handleSaveProviderConfig}
        >
          <div className="provider-detail-header">
            <div>
              <p className="eyebrow">当前服务</p>
              <h3>{selectedProvider.name}</h3>
            </div>
            <div className="form-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setActiveProviderId(selectedProvider.id)}
                disabled={selectedProviderIsActive}
              >
                {selectedProviderIsActive ? '当前默认服务' : '设为默认服务'}
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={providerProfiles.length <= 1 || isSaving}
                onClick={() => void handleRemoveProvider()}
              >
                删除服务
              </button>
            </div>
          </div>

          <div className="provider-detail-grid">
            <label>
              <span>服务名称</span>
              <input
                value={selectedProvider.name}
                onChange={(event) =>
                  updateSelectedProvider((profile) => ({
                    ...profile,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="full-span">
              <span>API 地址</span>
              <input
                value={selectedProvider.baseUrl}
                placeholder="支持填写根地址或完整 chat/completions 地址"
                onChange={(event) =>
                  updateSelectedProvider((profile) => ({
                    ...profile,
                    baseUrl: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="provider-section">
            <div className="provider-section-header">
              <h4>凭据状态</h4>
              <p>{selectedProvider.hasApiKey ? '已保存' : '未配置'}</p>
            </div>
            <div className="settings-form">
              <label>
                <span>新的 API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  placeholder={
                    selectedProvider.hasApiKey
                      ? '已保存新值可直接覆盖'
                      : 'sk-...'
                  }
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSaveApiKey()}
                >
                  保存新凭据
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={isSaving || !selectedProvider.hasApiKey}
                  onClick={handleClearApiKey}
                >
                  清除凭据
                </button>
              </div>
            </div>
          </div>

          <div className="provider-section">
            <div className="provider-section-header">
              <h4>模型与默认环境</h4>
              <button
                className="ghost-button"
                type="button"
                disabled={
                  isSaving ||
                  isLoadingModels ||
                  !selectedProvider.hasApiKey ||
                  !selectedProvider.baseUrl.trim()
                }
                onClick={handleRefreshModels}
              >
                {isLoadingModels ? '获取中' : hasModels ? '刷新模型列表' : '获取模型列表'}
              </button>
            </div>

            <div className="provider-detail-grid">
              <label className="full-span">
                <span>默认模型</span>
                <input
                  list={hasModels ? modelListId : undefined}
                  value={selectedProvider.defaultModel}
                  placeholder={hasModels ? '可搜索或手动填写模型名' : '可手动填写模型名'}
                  onChange={(event) =>
                    updateSelectedProvider((profile) => ({
                      ...profile,
                      defaultModel: event.target.value,
                    }))
                  }
                />
                {hasModels ? (
                  <datalist id={modelListId}>
                    {selectedProviderModels.map((model) => (
                      <option
                        key={model}
                        value={model}
                      />
                    ))}
                  </datalist>
                ) : null}
              </label>
              <label>
                <span>温度</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={selectedProvider.temperature}
                  onChange={(event) =>
                    updateSelectedProvider((profile) => ({
                      ...profile,
                      temperature: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Top P</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={selectedProvider.topP}
                  onChange={(event) =>
                    updateSelectedProvider((profile) => ({
                      ...profile,
                      topP: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>最大输出 Token</span>
                <input
                  type="number"
                  min="1"
                  value={selectedProvider.maxOutputTokens}
                  onChange={(event) =>
                    updateSelectedProvider((profile) => ({
                      ...profile,
                      maxOutputTokens: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>记忆策略</span>
                <select
                  value={selectedProvider.memoryPolicy}
                  onChange={(event) =>
                    updateSelectedProvider((profile) => ({
                      ...profile,
                      memoryPolicy: event.target.value as ProviderProfile['memoryPolicy'],
                    }))
                  }
                >
                  <option value="none">none</option>
                  <option value="recent-window">recent-window</option>
                  <option value="summary-plus-recent">summary-plus-recent</option>
                </select>
              </label>
            </div>

            <div className="provider-model-list side-card">
              <div className="provider-section-header">
                <h4>已发现模型</h4>
                <p>{selectedProviderModels.length} 个</p>
              </div>
              {selectedProviderModels.length > 0 ? (
                <div className="provider-model-items">
                  {selectedProviderModels.map((model) => (
                    <button
                      key={model}
                      className={
                        model === selectedProvider.defaultModel
                          ? 'provider-model-item active'
                          : 'provider-model-item'
                      }
                      type="button"
                      onClick={() =>
                        updateSelectedProvider((profile) => ({
                          ...profile,
                          defaultModel: model,
                        }))
                      }
                    >
                      {model}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="helper-text">
                  还没有缓存模型列表。当前提供方不支持时，也可以直接手动填写模型名。
                </p>
              )}
            </div>
          </div>

          <div className="form-actions provider-detail-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={isSaving}
            >
              保存服务配置
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={providerProfiles.length <= 1 || isSaving}
              onClick={() => void handleRemoveProvider()}
            >
              删除服务
            </button>
          </div>
        </form>
      </div>

      {statusMessage ? <p className="banner-note">{statusMessage}</p> : null}
    </section>
  )
}
