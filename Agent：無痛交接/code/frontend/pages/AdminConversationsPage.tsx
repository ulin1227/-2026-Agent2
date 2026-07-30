import { listAgentRecords } from "@/backend/services/agent-records";

const statusLabel = {
  safe: "安全通過",
  review: "部分資訊不足",
  blocked: "未通過",
};

export default function AdminConversationsPage() {
  const records = listAgentRecords();
  const selected = records[0];

  return (
    <main className="app-shell is-agent-collapsed">
      <aside className="sidebar" aria-label="管理者導覽">
        <div className="brand-row">
          <div className="brand-identity">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <i />
              <b />
            </div>
            <div className="brand-copy">
              <strong>接續</strong>
              <small>AGENT2</small>
            </div>
          </div>
        </div>
        <div className="main-nav">
          <button className="is-active" type="button">
            <span className="nav-icon">◎</span>
            <span className="nav-label">管理者</span>
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="local-dot" />
          <div>
            <b>FM06</b>
            <small>對話審查</small>
          </div>
        </div>
      </aside>

      <section className="workspace admin-workspace" aria-label="管理者檢視">
        <header className="topbar">
          <div>
            <p className="breadcrumb">
              Admin <i>/</i> Output Guardrail
            </p>
            <h1>輔助對話管理頁</h1>
          </div>
        </header>

        <div className="content-scroll">
          <section className="map-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Logs</p>
                <h2>系統對話日誌</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <span
                  className={`score-pill score-${
                    selected.sourceType === "agent-live" ? "good" : "warn"
                  }`}
                >
                  {selected.sourceType === "agent-live" ? "Agent 實際紀錄" : "範例資料"}
                </span>
                <span className={`score-pill score-${selected.status === "safe" ? "good" : "warn"}`}>
                  {statusLabel[selected.status]}
                </span>
              </div>
            </div>

            <div className="grid gap-4 pt-4 lg:grid-cols-[280px_1fr]">
              <aside className="grid content-start gap-2" aria-label="對話清單">
                {records.map((item) => (
                  <article
                    className={`rounded-[13px] border p-3 ${
                      item.id === selected.id
                        ? "border-[var(--sage)] bg-[var(--sage-soft)]"
                        : "border-[var(--line)] bg-white"
                    }`}
                    key={item.id}
                  >
                    <span
                      className={`score-pill ${
                        item.status === "safe"
                          ? "score-good"
                          : item.status === "blocked"
                            ? "score-risk"
                            : "score-warn"
                      }`}
                    >
                      {statusLabel[item.status]}
                    </span>
                    <span
                      className={`score-pill ml-1 ${
                        item.sourceType === "agent-live" ? "score-good" : "score-warn"
                      }`}
                    >
                      {item.sourceType === "agent-live" ? "live" : "seed"}
                    </span>
                    <strong className="mt-2 block text-xs">{item.topic}</strong>
                    <p className="mb-2 mt-1 text-[11px] leading-6 text-[var(--muted)]">
                      {item.question}
                    </p>
                    <small className="text-[10px] text-[var(--muted)]">
                      {item.jobId} / {item.user}
                    </small>
                  </article>
                ))}
              </aside>

              <section aria-label="評估摘要和結果">
                <div className="criteria-grid">
                  <article className="criterion-card">
                    <span className="criterion-no">01</span>
                    <div>
                      <h3>信心分數</h3>
                      <p>依據 Claim 與 RAG 來源的比對結果計算。</p>
                    </div>
                    <strong>{selected.confidence}<small>%</small></strong>
                    <span className="meter"><i style={{ width: `${selected.confidence}%` }} /></span>
                  </article>
                  <article className="criterion-card">
                    <span className="criterion-no">02</span>
                    <div>
                      <h3>參考資料</h3>
                      <p>保留回答所依據的來源文件與日期。</p>
                    </div>
                    <strong>{selected.sources.length}</strong>
                    <span className="meter"><i style={{ width: "66%" }} /></span>
                  </article>
                  <article className="criterion-card">
                    <span className="criterion-no">03</span>
                    <div>
                      <h3>Agent Provider</h3>
                      <p>確認這筆紀錄來自 OpenClaw 或本機 fallback。</p>
                    </div>
                    <strong className="text-sm">{selected.provider}</strong>
                    <span className="meter">
                      <i style={{ width: selected.provider === "openclaw" ? "100%" : "38%" }} />
                    </span>
                  </article>
                  <article className="criterion-card">
                    <span className="criterion-no">04</span>
                    <div>
                      <h3>語氣來源</h3>
                      <p>顯示前輩語氣是否由 Notion / Slack 紀錄推得。</p>
                    </div>
                    <strong className="text-sm">{selected.toneProfile.status}</strong>
                    <span className="meter">
                      <i style={{ width: selected.toneProfile.status === "matched" ? "100%" : "45%" }} />
                    </span>
                  </article>
                </div>

                <div className="rules-panel">
                  <div>
                    <p className="eyebrow">Result</p>
                    <h3>評估摘要和結果</h3>
                  </div>
                  <ul>
                    <li>
                      <b>原始問題：</b>{selected.question}
                    </li>
                    <li>
                      <b>最終輸出：</b>{selected.answer}
                    </li>
                    <li>
                      <b>Agent Job：</b>{selected.jobId}
                    </li>
                    <li>
                      <b>來源類型：</b>
                      {selected.sourceType === "agent-live"
                        ? "使用者頁實際送出的 Agent 回覆"
                        : "尚未有實際紀錄，先顯示管理頁範例資料"}
                    </li>
                    <li>
                      <b>產生時間：</b>{selected.createdAt}
                    </li>
                    <li>
                      <b>目前模式：</b>{selected.modeLabel}
                    </li>
                    <li>
                      <b>前輩語氣：</b>{selected.toneProfile.summary}
                    </li>
                  </ul>
                </div>

                <section className="mt-4 grid gap-2" aria-label="Agent 串接狀態">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Agent</p>
                      <h2>Agent 串接資料</h2>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.connectors.map((connector) => (
                      <span
                        className={`score-pill ${
                          connector.status === "pending"
                            ? "score-warn"
                            : connector.status === "empty"
                              ? "score-risk"
                              : "score-good"
                        }`}
                        key={connector.name}
                      >
                        {connector.name} {connector.status} / {connector.records}
                      </span>
                    ))}
                  </div>
                  <article className="source-chip">
                    <span>RAG</span>
                    <p>
                      <b>{selected.rag.status}</b>
                      <small>{selected.rag.note}</small>
                    </p>
                  </article>
                </section>

                <section className="claim-table mt-4" aria-label="聲明檢查">
                  <div className="claim-row claim-head">
                    <span>Claim</span>
                    <span>Guardrail 結果</span>
                  </div>
                  {selected.claims.map((claim) => (
                    <div className="claim-row" key={claim.text}>
                      <span>
                        {claim.text}
                        {claim.evidenceTitle ? (
                          <small className="mt-1 block text-[10px] text-[var(--muted)]">
                            evidence：{claim.evidenceTitle}
                          </small>
                        ) : null}
                      </span>
                      <strong>
                        {claim.verdict}
                        {typeof claim.supportScore === "number" ? ` / S ${claim.supportScore}` : ""}
                        {typeof claim.contradictionScore === "number"
                          ? ` / C ${claim.contradictionScore}`
                          : ""}
                      </strong>
                    </div>
                  ))}
                </section>

                <section className="mt-4 grid gap-2" aria-label="參考資料">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">References</p>
                      <h2>參考資料</h2>
                    </div>
                  </div>
                  {selected.sources.map((source) => (
                    <article className="source-chip" key={source.title}>
                      <span>SRC</span>
                      <p>
                        <b>{source.title}</b>
                        <small>
                          {source.detail} / {source.owner} / {source.date}
                        </small>
                      </p>
                    </article>
                  ))}
                </section>
              </section>
            </div>
          </section>
        </div>
      </section>

      <aside className="agent-panel" aria-label="管理狀態">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar" aria-hidden="true">
              <span />
            </div>
            <div className="agent-header-copy">
              <strong>Guardrail</strong>
              <small><i />審查完成</small>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
