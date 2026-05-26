import { FormEvent, useEffect, useState } from 'react'
import { useSettingsStore } from '../store/useSettingsStore'

export function GlobalSettingsPage() {
  const settings = useSettingsStore((state) => state.settings)
  const isSaving = useSettingsStore((state) => state.isSaving)
  const saveSettings = useSettingsStore((state) => state.saveSettings)
  const saveApiKey = useSettingsStore((state) => state.saveApiKey)
  const clearApiKey = useSettingsStore((state) => state.clearApiKey)
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [model, setModel] = useState(settings.model)
  const [temperature, setTemperature] = useState(String(settings.temperature))
  const [topP, setTopP] = useState(String(settings.topP))
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(settings.maxOutputTokens))
  const [memoryPolicy, setMemoryPolicy] = useState(settings.memoryPolicy)
  const [apiKey, setApiKey] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    setBaseUrl(settings.baseUrl)
    setModel(settings.model)
    setTemperature(String(settings.temperature))
    setTopP(String(settings.topP))
    setMaxOutputTokens(String(settings.maxOutputTokens))
    setMemoryPolicy(settings.memoryPolicy)
  }, [settings])

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await saveSettings({
      baseUrl,
      model,
      temperature: Number(temperature),
      topP: Number(topP),
      maxOutputTokens: Number(maxOutputTokens),
      memoryPolicy,
    })

    setStatusMessage('默认环境已保存。')
  }

  async function handleApiKeySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!apiKey.trim()) {
      setStatusMessage('API Key 不能为空。')
      return
    }

    await saveApiKey(apiKey.trim())
    setApiKey('')
    setStatusMessage('API Key 已写入系统凭据存储。')
  }

  async function handleClearApiKey() {
    await clearApiKey()
    setStatusMessage('API Key 已清除。')
  }

  return (
    <section className="standalone-page">
      <div className="page-hero">
        <p className="eyebrow">M1 设置主链</p>
        <h2>全局设置</h2>
        <p>当前页已经接入真实默认环境保存链路。普通配置落到本地事实库，敏感凭据走 Tauri 侧系统凭据存储。</p>
      </div>
      <div className="settings-grid">
        <article className="placeholder-card">
          <h3>默认环境</h3>
          <form
            className="settings-form"
            onSubmit={handleSettingsSubmit}
          >
            <label>
              <span>API 地址</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>
            <label>
              <span>默认模型</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            <label>
              <span>温度</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
              />
            </label>
            <label>
              <span>Top P</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={topP}
                onChange={(event) => setTopP(event.target.value)}
              />
            </label>
            <label>
              <span>最大输出 Token</span>
              <input
                type="number"
                min="1"
                value={maxOutputTokens}
                onChange={(event) => setMaxOutputTokens(event.target.value)}
              />
            </label>
            <label>
              <span>记忆策略</span>
              <select
                value={memoryPolicy}
                onChange={(event) =>
                  setMemoryPolicy(
                    event.target.value as typeof settings.memoryPolicy,
                  )
                }
              >
                <option value="none">none</option>
                <option value="recent-window">recent-window</option>
                <option value="summary-plus-recent">summary-plus-recent</option>
              </select>
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={isSaving}
            >
              保存默认环境
            </button>
          </form>
        </article>
        <article className="placeholder-card">
          <h3>凭据边界</h3>
          <p>API Key 通过 Tauri 侧系统凭据存储管理，不与普通配置混存，也不回流到前端状态。</p>
          <p>当前状态：{settings.hasApiKey ? '已配置' : '未配置'}</p>
          <form
            className="settings-form"
            onSubmit={handleApiKeySubmit}
          >
            <label>
              <span>新的 API Key</span>
              <input
                type="password"
                value={apiKey}
                placeholder={settings.hasApiKey ? '已保存新值可直接覆盖' : 'sk-...'}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving}
              >
                保存凭据
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={isSaving || !settings.hasApiKey}
                onClick={handleClearApiKey}
              >
                清除凭据
              </button>
            </div>
          </form>
        </article>
        <article className="placeholder-card">
          <h3>价格表策略</h3>
          <p>当前默认使用内置静态价格表，后续会在高级入口里提供覆盖能力，不进入首版主流程。</p>
          <p>当前预设：{settings.pricePreset}</p>
        </article>
      </div>
      {statusMessage ? <p className="banner-note">{statusMessage}</p> : null}
    </section>
  )
}
