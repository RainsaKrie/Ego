import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useConversationStore } from '../store/useConversationStore'
import { useObservabilityStore } from '../../observability/store/useObservabilityStore'
import { useSettingsStore } from '../../settings/store/useSettingsStore'

export function ConversationWorkbenchPage() {
  const conversations = useConversationStore((state) => state.conversations)
  const activeConversationId = useConversationStore((state) => state.activeConversationId)
  const messagesByConversationId = useConversationStore((state) => state.messagesByConversationId)
  const conversationSettingsById = useConversationStore((state) => state.conversationSettingsById)
  const streamingMessagesByConversationId = useConversationStore(
    (state) => state.streamingMessagesByConversationId,
  )
  const selectConversation = useConversationStore((state) => state.selectConversation)
  const createConversation = useConversationStore((state) => state.createConversation)
  const sendMessage = useConversationStore((state) => state.sendMessage)
  const stopMessage = useConversationStore((state) => state.stopMessage)
  const retryLatestFailedMessage = useConversationStore(
    (state) => state.retryLatestFailedMessage,
  )
  const isSending = useConversationStore((state) => state.isSending)
  const isStopping = useConversationStore((state) => state.isStopping)
  const sendError = useConversationStore((state) => state.sendError)
  const saveConversationSettings = useConversationStore((state) => state.saveConversationSettings)
  const resetConversationSettings = useConversationStore((state) => state.resetConversationSettings)
  const isSavingEnvironment = useConversationStore((state) => state.isSavingEnvironment)
  const latestRequest = useObservabilityStore((state) => state.latestRequest)
  const settings = useSettingsStore((state) => state.settings)
  const [draft, setDraft] = useState('')
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())
  const [environmentNotice, setEnvironmentNotice] = useState<string | null>(null)
  const [isEnvironmentEditorOpen, setIsEnvironmentEditorOpen] = useState(false)
  const activeConversationSettings = activeConversationId
    ? conversationSettingsById[activeConversationId]
    : null
  const [environmentForm, setEnvironmentForm] = useState({
    model: settings.model,
    temperature: String(settings.temperature),
    topP: String(settings.topP),
    maxOutputTokens: String(settings.maxOutputTokens),
    memoryPolicy: settings.memoryPolicy,
  })

  const activeMessages = useMemo(
    () => (activeConversationId ? messagesByConversationId[activeConversationId] ?? [] : []),
    [activeConversationId, messagesByConversationId],
  )
  const activeStreamingMessage = useMemo(
    () =>
      activeConversationId
        ? streamingMessagesByConversationId[activeConversationId] ?? null
        : null,
    [activeConversationId, streamingMessagesByConversationId],
  )
  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  )
  const canRetryLatestFailedMessage =
    !!activeConversationId &&
    !isSending &&
    latestRequest.status === 'failed' &&
    latestRequest.conversationId === activeConversationId

  useEffect(() => {
    if (latestRequest.status !== 'pending' || !latestRequest.startedAt) {
      return
    }

    setNowTimestamp(Date.now())

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [latestRequest.status, latestRequest.startedAt])

  const latestRequestElapsedMs = useMemo(() => {
    if (latestRequest.status !== 'pending' || !latestRequest.startedAt) {
      return latestRequest.latencyMs
    }

    const startedAt = Date.parse(latestRequest.startedAt)

    if (Number.isNaN(startedAt)) {
      return latestRequest.latencyMs
    }

    return Math.max(0, nowTimestamp - startedAt)
  }, [latestRequest.latencyMs, latestRequest.startedAt, latestRequest.status, nowTimestamp])

  const hasFinalUsage =
    latestRequest.requestTotalTokens !== null ||
    latestRequest.promptTokens !== null ||
    latestRequest.completionTokens !== null ||
    latestRequest.usageSource !== 'unknown' ||
    latestRequest.estimatedCostUsd > 0

  const latestRequestTokenDisplay =
    latestRequest.status === 'pending' ||
    (latestRequest.status !== 'completed' && !hasFinalUsage)
      ? '--'
      : String(latestRequest.requestTotalTokens ?? 0)

  const latestRequestCostDisplay =
    latestRequest.status === 'pending' ||
    (latestRequest.status !== 'completed' && !hasFinalUsage)
      ? '--'
      : `$${latestRequest.estimatedCostUsd.toFixed(4)}`

  const latestRequestSourceDisplay =
    latestRequest.status === 'pending' ||
    (latestRequest.status !== 'completed' && !hasFinalUsage)
      ? '--'
      : latestRequest.usageSource

  const latestRequestLatencyDisplay =
    latestRequestElapsedMs < 1000
      ? `${latestRequestElapsedMs} ms`
      : `${(latestRequestElapsedMs / 1000).toFixed(latestRequestElapsedMs < 10_000 ? 1 : 0)} s`

  useEffect(() => {
    const snapshot = activeConversationSettings ?? {
      model: settings.model,
      temperature: settings.temperature,
      topP: settings.topP,
      maxOutputTokens: settings.maxOutputTokens,
      memoryPolicy: settings.memoryPolicy,
    }

    setEnvironmentForm({
      model: snapshot.model,
      temperature: String(snapshot.temperature),
      topP: String(snapshot.topP),
      maxOutputTokens: String(snapshot.maxOutputTokens),
      memoryPolicy: snapshot.memoryPolicy,
    })
  }, [activeConversationSettings, settings])

  async function handleEnvironmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await saveConversationSettings({
      model: environmentForm.model,
      temperature: Number(environmentForm.temperature),
      topP: Number(environmentForm.topP),
      maxOutputTokens: Number(environmentForm.maxOutputTokens),
      memoryPolicy: environmentForm.memoryPolicy,
    })

    setEnvironmentNotice('当前会话环境已保存，只影响这个会话。')
    setIsEnvironmentEditorOpen(false)
  }

  async function handleResetEnvironment() {
    await resetConversationSettings()
    setEnvironmentNotice('当前会话已恢复为全局默认环境。')
    setIsEnvironmentEditorOpen(false)
  }

  function openEnvironmentEditor(conversationId: string) {
    selectConversation(conversationId)
    setEnvironmentNotice(null)
    setIsEnvironmentEditorOpen(true)
  }

  return (
    <>
      <section className="workbench-grid">
        <aside className="panel panel-left">
          <div className="panel-header">
            <div>
              <p className="eyebrow">会话列表</p>
              <h2>会话</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={createConversation}
            >
              新建
            </button>
          </div>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={
                  conversation.id === activeConversationId
                    ? 'conversation-item active'
                    : 'conversation-item'
                }
                onContextMenu={(event) => {
                  event.preventDefault()
                  openEnvironmentEditor(conversation.id)
                }}
              >
                <button
                  className="conversation-main"
                  type="button"
                  onClick={() => selectConversation(conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <span>{new Date(conversation.updatedAt).toLocaleString('zh-CN')}</span>
                </button>
                <button
                  className="conversation-menu-button"
                  type="button"
                  aria-label={`编辑 ${conversation.title} 的会话环境`}
                  onClick={() => openEnvironmentEditor(conversation.id)}
                >
                  ...
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="panel panel-center">
          <div className="environment-strip">
            <span>环境</span>
            <strong>{activeConversationSettings?.model ?? settings.model}</strong>
            <span>{activeConversationSettings?.memoryPolicy ?? settings.memoryPolicy}</span>
            <span>
              温度 {activeConversationSettings?.temperature ?? settings.temperature}
            </span>
            <span>{activeConversationSettings?.inheritsDefault ? '继承默认' : '会话覆盖中'}</span>
          </div>
          <div className="inline-meta">
            <span>请求数 {latestRequest.requestCount}</span>
            <span>累计 Token {latestRequest.cumulativeTotalTokens}</span>
          </div>
        
        <div className="message-list">
          {activeMessages.map((message) => (
            <article
              key={message.id}
              className={message.role === 'assistant' ? 'message assistant' : 'message'}
            >
              <header className="message-meta">
                <div className="message-identity">
                  <div className="message-heading">
                    <strong>
                      {message.role === 'assistant'
                        ? `${activeConversationSettings?.model ?? settings.model}`
                        : '用户'}
                    </strong>
                    <span>{new Date(message.createdAt).toLocaleString('zh-CN')}</span>
                  </div>
                </div>
              </header>
              <p>{message.content}</p>
            </article>
          ))}
          {activeStreamingMessage ? (
            <article className="message assistant streaming-message">
              <header className="message-meta">
                <div className="message-identity">
                  <div className="message-heading">
                    <strong>{activeStreamingMessage.model}</strong>
                    <span>
                      {new Date(activeStreamingMessage.startedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>
              </header>
              <p>
                {activeStreamingMessage.content || '正在生成回答'}
                <span className="message-stream-tail" aria-hidden="true">
                  {' '}
                  ...
                </span>
              </p>
            </article>
          ) : null}
          {canRetryLatestFailedMessage ? (
            <div className="message-failure-note">请求失败</div>
          ) : null}
          {activeMessages.length === 0 && !activeStreamingMessage ? (
            <div className="empty-state">
              <h3>新会话已创建</h3>
              <p>当前已经可以从这个输入区直接进入真实请求主链。先发一条消息，就能验证用户消息、请求记录和模型流式回复的最小闭环。</p>
            </div>
          ) : null}
          </div>
          <div className="composer">
            <textarea
              placeholder="输入一条消息，走真实的 OpenAI-compatible 流式请求主链。"
              rows={4}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="composer-footer">
              <span>
                {isStopping
                  ? '正在请求停止当前生成，系统会把这次请求标记为已中止，不会落正式助手消息。'
                  : isSending
                  ? '请求发送中，当前会先建 RequestRecord(pending)，再逐步显示临时文本，完成后才落正式助手消息。'
                  : sendError || '当前已接入真实发送主链，失败时会保留用户消息与请求记录。'}
              </span>
              {canRetryLatestFailedMessage ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={retryLatestFailedMessage}
                >
                  重试
                </button>
              ) : null}
              <button
                className="primary-button"
                type="button"
                disabled={
                  !activeConversationId ||
                  (isSending ? isStopping : !draft.trim())
                }
                onClick={async () => {
                  if (isSending) {
                    await stopMessage()
                    return
                  }

                  const content = draft
                  setDraft('')
                  await sendMessage(content)
                }}
              >
                {isStopping ? '中止中' : isSending ? '中止' : '发送'}
              </button>
            </div>
          </div>
        </main>

        <aside className="panel panel-right">
          <div className="panel-header">
            <div>
              <p className="eyebrow">会话环境</p>
              <h2>当前会话环境</h2>
            </div>
          </div>
          <section className="side-card compact-card">
            <div className="compact-grid">
              <div>
                <dt>模型</dt>
                <dd>{activeConversationSettings?.model ?? settings.model}</dd>
              </div>
              <div>
                <dt>记忆策略</dt>
                <dd>{activeConversationSettings?.memoryPolicy ?? settings.memoryPolicy}</dd>
              </div>
              <div>
                <dt>温度</dt>
                <dd>{activeConversationSettings?.temperature ?? settings.temperature}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{activeConversationSettings?.inheritsDefault ? '继承默认' : '会话覆盖中'}</dd>
              </div>
            </div>
            {environmentNotice ? <p className="banner-note compact">{environmentNotice}</p> : null}
          </section>
          <div className="panel-header panel-subheader">
            <div>
              <p className="eyebrow">最近一次请求</p>
              <h2>最近一次请求</h2>
            </div>
          </div>
          <section className="side-card compact-card">
            <div className="compact-grid">
              <div>
                <dt>状态</dt>
                <dd>{latestRequest.status}</dd>
              </div>
              <div>
                <dt>模型</dt>
                <dd>{latestRequest.model ?? '暂无'}</dd>
              </div>
              <div>
                <dt>本次 Token</dt>
                <dd>{latestRequestTokenDisplay}</dd>
              </div>
              <div>
                <dt>延迟</dt>
                <dd>{latestRequestLatencyDisplay}</dd>
              </div>
              <div>
                <dt>成本</dt>
                <dd>{latestRequestCostDisplay}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{latestRequestSourceDisplay}</dd>
              </div>
            </div>
            <details className="request-details">
              <summary>查看详细信息</summary>
              <dl className="compact-grid details-grid">
                <div className="full-span">
                  <dt>请求 ID</dt>
                  <dd>{latestRequest.requestId ?? '暂无'}</dd>
                </div>
                <div>
                  <dt>输入 Token</dt>
                  <dd>{latestRequest.promptTokens ?? 0}</dd>
                </div>
                <div>
                  <dt>输出 Token</dt>
                  <dd>{latestRequest.completionTokens ?? 0}</dd>
                </div>
                <div>
                  <dt>累计 Token</dt>
                  <dd>{latestRequest.cumulativeTotalTokens}</dd>
                </div>
                <div>
                  <dt>记忆策略</dt>
                  <dd>{latestRequest.memoryPolicy ?? '暂无'}</dd>
                </div>
                <div className="full-span">
                  <dt>开始时间</dt>
                  <dd>
                    {latestRequest.startedAt
                      ? new Date(latestRequest.startedAt).toLocaleString('zh-CN')
                      : '暂无'}
                  </dd>
                </div>
                <div className="full-span">
                  <dt>结束时间</dt>
                  <dd>
                    {latestRequest.finishedAt
                      ? new Date(latestRequest.finishedAt).toLocaleString('zh-CN')
                      : '暂无'}
                  </dd>
                </div>
                {latestRequest.errorMessage ? (
                  <div className="full-span">
                    <dt>错误</dt>
                    <dd>{latestRequest.errorMessage}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
          </section>
        </aside>
      </section>

      {isEnvironmentEditorOpen && activeConversationId ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setIsEnvironmentEditorOpen(false)}
        >
          <section
            className="dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-environment-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow">会话环境编辑</p>
                <h2 id="conversation-environment-editor-title">
                  {activeConversation?.title ?? '当前会话'}
                </h2>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setIsEnvironmentEditorOpen(false)}
              >
                关闭
              </button>
            </div>
            <p className="eyebrow">
              {activeConversationSettings?.inheritsDefault ? '继承全局默认' : '已偏离全局默认'}
            </p>
            <form
              className="settings-form"
              onSubmit={handleEnvironmentSubmit}
            >
              <label>
                <span>模型</span>
                <input
                  value={environmentForm.model}
                  onChange={(event) =>
                    setEnvironmentForm((state) => ({
                      ...state,
                      model: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>温度</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={environmentForm.temperature}
                  onChange={(event) =>
                    setEnvironmentForm((state) => ({
                      ...state,
                      temperature: event.target.value,
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
                  value={environmentForm.topP}
                  onChange={(event) =>
                    setEnvironmentForm((state) => ({
                      ...state,
                      topP: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>最大输出 Token</span>
                <input
                  type="number"
                  min="1"
                  value={environmentForm.maxOutputTokens}
                  onChange={(event) =>
                    setEnvironmentForm((state) => ({
                      ...state,
                      maxOutputTokens: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>记忆策略</span>
                <select
                  value={environmentForm.memoryPolicy}
                  onChange={(event) =>
                    setEnvironmentForm((state) => ({
                      ...state,
                      memoryPolicy: event.target.value as typeof state.memoryPolicy,
                    }))
                  }
                >
                  <option value="none">none</option>
                  <option value="recent-window">recent-window</option>
                  <option value="summary-plus-recent">summary-plus-recent</option>
                </select>
              </label>
              <div className="form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!activeConversationId || isSavingEnvironment}
                >
                  保存会话环境
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={
                    !activeConversationId ||
                    isSavingEnvironment ||
                    !!activeConversationSettings?.inheritsDefault
                  }
                  onClick={handleResetEnvironment}
                >
                  恢复默认环境
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
