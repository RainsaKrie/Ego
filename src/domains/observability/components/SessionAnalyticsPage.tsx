export function SessionAnalyticsPage() {
  return (
    <section className="standalone-page">
      <div className="page-hero">
        <p className="eyebrow">M3 范围</p>
        <h2>会话分析</h2>
        <p>
          当前页面先作为壳层占位，保持信息架构稳定。详细的趋势图、实验条件变化记录和成本解释会在
          `M3` 收口。
        </p>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <h3>总览指标</h3>
          <p>请求总数、累计 Token、累计成本估算、平均延迟。</p>
        </article>
        <article className="placeholder-card">
          <h3>趋势区</h3>
          <p>以 Token 趋势为主，延迟趋势为辅，成本趋势弱化呈现。</p>
        </article>
        <article className="placeholder-card">
          <h3>实验条件变化</h3>
          <p>只在关键变化发生时低存在感呈现，避免做成噪音后台。</p>
        </article>
      </div>
    </section>
  )
}
