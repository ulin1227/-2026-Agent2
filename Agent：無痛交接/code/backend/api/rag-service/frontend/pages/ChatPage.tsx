"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  knowledgeModes,
  projectMapBranches,
  riskCards,
  roadmapItems,
  type ProjectMapBranch,
  type ProjectMapNode,
  type Source,
} from "@/shared/data/fm06";
import type {
  AgentContentBlock,
  AgentReply,
  ConnectorStatus,
  ToneProfile,
} from "@/backend/services/agent";

type Message = {
  id: string;
  role: "user" | "agent";
  text: string;
  contentBlocks?: AgentContentBlock[];
  meta?: {
    jobId: string;
    status: AgentReply["status"];
    confidence: number;
    sources: Source[];
    guardrail: AgentReply["guardrail"];
    toneProfile: ToneProfile;
    connectors: ConnectorStatus[];
    rag: AgentReply["rag"];
    provider: AgentReply["meta"]["provider"];
  };
};

const initialAgentMeta: Message["meta"] = {
  jobId: "job-agent-initial",
  status: "safe",
  confidence: 86,
  provider: "local-codex-mock",
  sources: [
    {
      title: "Project ORBIT 交接資料",
      detail: "目前已載入業務內容、人際關係與公司資產三類 Demo 文件。",
      owner: "林書妍",
      date: "2026-07-22",
    },
    {
      title: "完備性檢查規範",
      detail: "回答需依 B1-B3、P1-P3、A1-A3 檢查完備度並標示來源。",
      owner: "小組規範",
      date: "2026-07-25",
    },
  ],
  guardrail: {
    status: "safe",
    confidence: 86,
    recommendation: "初始提示已通過基本檢查。",
    warnings: [],
    evidenceMode: "demo",
    anchoringScore: 1,
    claims: [{ text: "前端會透過 Agent API 回答問題。", verdict: "支持" }],
  },
  toneProfile: {
    profileId: "default-senior-tone",
    speakerName: "系統預設前輩",
    source: "default",
    status: "fallback",
    sampleCount: 0,
    traits: ["資訊不足時不猜測", "把下一步講清楚"],
    summary: "初始訊息使用系統預設交接語氣。",
    styleInstruction: "用有經驗同事的口吻回答。",
  },
  connectors: [
    {
      name: "rag",
      status: "pending",
      records: 0,
      note: "等待 RAG 模組接入。",
    },
  ],
  rag: {
    status: "pending",
    chunks: [],
    note: "RAG 尚未串接完成；目前先用 Agent mock 測試。",
    evidenceMode: "none",
  },
};

const statusLabel = {
  safe: "安全通過",
  review: "需要確認",
  blocked: "已阻擋",
} satisfies Record<AgentReply["status"], string>;

function scoreClass(status: AgentReply["status"]) {
  if (status === "blocked") return "score-risk";
  if (status === "review") return "score-warn";
  return "score-good";
}

const checklistStatusLabel = {
  todo: "待做",
  doing: "進行中",
  done: "完成",
  watch: "注意",
} satisfies Record<Extract<AgentContentBlock, { type: "checklist" }>["items"][number]["status"], string>;

function checklistStatusClass(
  status: Extract<AgentContentBlock, { type: "checklist" }>["items"][number]["status"],
) {
  if (status === "done") return "score-good";
  if (status === "watch") return "score-warn";
  if (status === "doing") return "score-good";
  return "score-warn";
}

function renderContentBlock(block: AgentContentBlock, messageId: string) {
  if (block.type === "table") {
    return (
      <section className="agent-rich-block" key={`${messageId}-${block.title}`}>
        <h3>{block.title}</h3>
        <div className="agent-table-wrap">
          <table className="agent-table">
            <thead>
              <tr>
                {block.columns.map((column) => (
                  <th key={`${messageId}-${block.title}-${column}`}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${messageId}-${block.title}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${messageId}-${block.title}-${rowIndex}-${cellIndex}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (block.type === "checklist") {
    return (
      <section className="agent-rich-block" key={`${messageId}-${block.title}`}>
        <h3>{block.title}</h3>
        <div className="agent-checklist">
          {block.items.map((item) => (
            <article key={`${messageId}-${block.title}-${item.label}`}>
              <span className={`score-pill ${checklistStatusClass(item.status)}`}>
                {checklistStatusLabel[item.status]}
              </span>
              <div>
                <b>{item.label}</b>
                <small>{item.detail}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="agent-rich-block" key={`${messageId}-${block.title}`}>
      <h3>{block.title}</h3>
      <div className="agent-score-bars">
        {block.items.map((item) => (
          <article key={`${messageId}-${block.title}-${item.label}`}>
            <div>
              <b>{item.label}</b>
              <span>{item.value}/{item.max}</span>
            </div>
            <i className={`score-bar-fill ${scoreClass(item.status)}`}>
              <span style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }} />
            </i>
          </article>
        ))}
      </div>
    </section>
  );
}

function LoadingDots() {
  return (
    <span className="typing-indicator" aria-label="Agent 正在回覆" role="status">
      <span />
      <span />
      <span />
    </span>
  );
}

function roadmapStateClass(state: (typeof roadmapItems)[number]["state"]) {
  if (state === "done") return "score-good";
  if (state === "active") return "score-warn";
  return "score-good";
}

function roadmapStateLabel(state: (typeof roadmapItems)[number]["state"]) {
  if (state === "done") return "完成";
  if (state === "active") return "進行中";
  return "下一步";
}

function ProjectMapPreview({
  selectedBranchId,
  onSelectBranch,
  onSelectPrompt,
}: {
  selectedBranchId: ProjectMapBranch["id"];
  onSelectBranch: (id: ProjectMapBranch["id"]) => void;
  onSelectPrompt: (prompt: string) => void;
}) {
  const selectedBranch =
    projectMapBranches.find((branch) => branch.id === selectedBranchId) ??
    projectMapBranches[0];
  const nodeCount = projectMapBranches.reduce(
    (total, branch) => total + branch.nodes.length,
    0,
  );

  return (
    <div className="chat-preview__body chat-project-map">
      <div className="chat-map-center">
        <span>PROJECT</span>
        <strong>Project ORBIT</strong>
        <small>{nodeCount} 個節點已接入</small>
      </div>

      <div className="chat-map-branches" aria-label="企劃地圖分類">
        {projectMapBranches.map((branch) => (
          <button
            className={`chat-map-branch ${branch.id === selectedBranch.id ? "is-active" : ""}`}
            key={branch.id}
            type="button"
            onClick={() => onSelectBranch(branch.id)}
            aria-pressed={branch.id === selectedBranch.id}
          >
            <span>{branch.eyebrow.split("｜")[0]}</span>
            <strong>{branch.title}</strong>
            <small>{branch.nodes.length} 節點</small>
          </button>
        ))}
      </div>

      <section className="chat-map-detail" aria-label={`${selectedBranch.title}節點`}>
        <div className="chat-map-detail__intro">
          <strong>{selectedBranch.title}</strong>
          <p>{selectedBranch.summary}</p>
        </div>
        <div className="chat-map-node-list">
          {selectedBranch.nodes.map((node) => (
            <ProjectMapNodeButton
              key={node.id}
              node={node}
              onSelectPrompt={onSelectPrompt}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectMapNodeButton({
  node,
  onSelectPrompt,
}: {
  node: ProjectMapNode;
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <button
      className="chat-map-node"
      type="button"
      onClick={() => onSelectPrompt(node.prompt)}
    >
      <span className={`score-pill ${scoreClass(node.status)}`}>
        {node.status === "review" ? "待確認" : node.status === "blocked" ? "阻斷" : "可執行"}
      </span>
      <strong>{node.title}</strong>
      <small>{node.summary}</small>
      <p>{node.detail}</p>
    </button>
  );
}

function RoadmapPreview({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div className="chat-preview__body chat-roadmap">
      {roadmapItems.map((item, index) => (
        <button
          className="chat-roadmap-step"
          key={item.label}
          type="button"
          onClick={() => onSelectPrompt(item.prompt)}
        >
          <span className="chat-roadmap-step__index">{index + 1}</span>
          <div>
            <span className={`score-pill ${roadmapStateClass(item.state)}`}>
              {roadmapStateLabel(item.state)}
            </span>
            <strong>{item.label}</strong>
            <small>{item.owner}</small>
            <p>{item.detail}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function RiskPreview({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div className="chat-preview__body chat-risk-grid">
      {riskCards.map((risk) => (
        <button
          className="chat-risk-card"
          key={risk.id}
          type="button"
          onClick={() => onSelectPrompt(risk.prompt)}
        >
          <span className={`score-pill ${scoreClass(risk.status)}`}>
            {risk.status === "blocked" ? "需升級" : "待確認"}
          </span>
          <strong>{risk.title}</strong>
          <small>{risk.owner}</small>
          <p>{risk.impact}</p>
        </button>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const [modeId, setModeId] = useState<(typeof knowledgeModes)[number]["id"]>(
    "project-map",
  );
  const [selectedBranchId, setSelectedBranchId] = useState<ProjectMapBranch["id"]>(
    projectMapBranches[0].id,
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  const mode = useMemo(
    () => knowledgeModes.find((item) => item.id === modeId) ?? knowledgeModes[0],
    [modeId],
  );

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    const timestamp = Date.now();
    setError("");
    setInput("");
    setIsSending(true);
    setMessages((current) => [
      ...current,
      { id: `u-${timestamp}`, role: "user", text },
    ]);

    try {
      const response = await fetch("/api/agent/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: text,
          mode: modeId,
          conversationType: "handoff",
          projectId: "fm06",
          seniorId: "senior-lin",
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent API 回傳 ${response.status}`);
      }

      const reply = (await response.json()) as AgentReply;
      setMessages((current) => [
        ...current,
        {
          id: `a-${timestamp}`,
          role: "agent",
          text: reply.answer,
          contentBlocks: reply.contentBlocks,
          meta: {
            jobId: reply.jobId,
            status: reply.status,
            confidence: reply.confidence,
            sources: reply.sources,
            guardrail: reply.guardrail,
            toneProfile: reply.toneProfile,
            connectors: reply.connectors,
            rag: reply.rag,
            provider: reply.meta.provider,
          },
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Agent API 發生未知錯誤";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: `a-error-${timestamp}`,
          role: "agent",
          text: `Agent 目前沒有成功回覆：${message}。請稍後再送出一次，或先確認 API 是否啟動。`,
          meta: {
            ...initialAgentMeta,
            jobId: `job-agent-error-${timestamp}`,
            status: "review",
            confidence: 40,
          },
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="orchard-app chat-page">
      <header className="chat-page__header">
        <div>
          <p className="eyebrow">FM06 User</p>
          <h1 className="chat-page__title">輔助對話</h1>
        </div>
      </header>

      <section
        aria-label="輔助對話使用者頁"
        className="chat-page__layout"
      >
        <section
          aria-label="左側脈絡選擇"
          className="chat-context"
        >
          <button
            className="chat-back-button"
            type="button"
            aria-label="返回上一頁"
          >
            ←
          </button>

          <label className="chat-field-label" htmlFor="mode">
            下拉選單
          </label>
          <select
            id="mode"
            className="chat-select"
            value={modeId}
            onChange={(event) =>
              setModeId(
                event.target.value as (typeof knowledgeModes)[number]["id"],
              )
            }
          >
            {knowledgeModes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          <div className="chat-mode-list">
            {knowledgeModes.map((item) => (
              <button
                className={`chat-mode-button ${item.id === modeId ? "is-active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => setModeId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <article
            aria-label="顯示選擇結果"
            className="chat-preview"
          >
            <div className="chat-preview__top">
              <span className="score-pill score-good">{mode.label}</span>
              <strong className="chat-preview__title">目前查看：{mode.label}</strong>
            </div>
            {modeId === "project-map" ? (
              <ProjectMapPreview
                selectedBranchId={selectedBranchId}
                onSelectBranch={setSelectedBranchId}
                onSelectPrompt={setInput}
              />
            ) : modeId === "roadmap" ? (
              <RoadmapPreview onSelectPrompt={setInput} />
            ) : (
              <RiskPreview onSelectPrompt={setInput} />
            )}
          </article>
        </section>

        <section
          aria-label="聊天視窗"
          className="chat-window"
        >
          <header className="chat-window__header">
            <div>
              <h2>交接輔助 Agent</h2>
            </div>
          </header>

          <div className="chat-thread">
            {error ? (
              <div className="chat-error">{error}</div>
            ) : null}
            {messages.map((message) => (
              <article
                className={`chat-bubble ${
                  message.role === "user" ? "chat-bubble--user" : "chat-bubble--agent"
                }`}
                key={message.id}
              >
                {message.text.trim() ? (
                  <p className="agent-message-text">
                    {message.text}
                  </p>
                ) : null}
                {message.role === "agent" && message.contentBlocks?.length ? (
                  <div className="agent-rich-stack">
                    {message.contentBlocks.map((block) =>
                      renderContentBlock(block, message.id),
                    )}
                  </div>
                ) : null}
                {message.role === "agent" ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`score-pill ${scoreClass(message.meta?.status ?? "safe")}`}>
                        來源 {message.meta?.sources.length ?? 0}
                      </span>
                      <span className={`score-pill ${scoreClass(message.meta?.status ?? "safe")}`}>
                        信心分數 {message.meta?.confidence ?? 0}
                      </span>
                      <span className={`score-pill ${scoreClass(message.meta?.status ?? "safe")}`}>
                        {statusLabel[message.meta?.status ?? "safe"]}
                      </span>
                    </div>
                    <details className="chat-details">
                      <summary>查看來源與 Guardrail</summary>
                      {message.meta ? (
                        <div className="chat-details__body">
                          <p>
                            Provider：{message.meta.provider}｜Job：{message.meta.jobId}
                          </p>
                          <p>
                            語氣來源：{message.meta.toneProfile.summary}
                          </p>
                          <p>
                            RAG：{message.meta.rag.evidenceMode}｜{message.meta.rag.note}
                          </p>
                          <p>
                            Guardrail：{message.meta.guardrail.recommendation}
                            ｜Anchor {message.meta.guardrail.anchoringScore.toFixed(2)}
                          </p>
                          {message.meta.guardrail.warnings.length ? (
                            <p>
                              警示：{message.meta.guardrail.warnings.join("、")}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {message.meta.connectors.map((connector) => (
                              <span
                                className={`score-pill ${
                                  connector.status === "pending"
                                    ? "score-warn"
                                    : connector.status === "empty"
                                      ? "score-risk"
                                      : "score-good"
                                }`}
                                key={`${message.id}-${connector.name}`}
                              >
                                {connector.name} {connector.status} / {connector.records}
                              </span>
                            ))}
                          </div>
                          {message.meta.guardrail.claims.length ? (
                            <ul className="m-0 grid gap-1 pl-4">
                              {message.meta.guardrail.claims.slice(0, 5).map((claim) => (
                                <li key={`${message.id}-claim-${claim.text}`}>
                                  {claim.verdict}
                                  {typeof claim.supportScore === "number"
                                    ? `｜S ${claim.supportScore}`
                                    : ""}
                                  {typeof claim.contradictionScore === "number"
                                    ? `｜C ${claim.contradictionScore}`
                                    : ""}
                                  {claim.evidenceTitle ? `｜${claim.evidenceTitle}` : ""}：{claim.text}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {message.meta.sources.length ? (
                            <ul className="m-0 grid gap-1 pl-4">
                              {message.meta.sources.slice(0, 4).map((source) => (
                                <li key={`${message.id}-${source.title}`}>
                                  {source.title}：{source.detail}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : (
                        <p className="chat-details__body">
                          回答依據目前選擇的 {mode.label} 與交接文件片段；重要決策請查看原始來源。
                        </p>
                      )}
                    </details>
                  </>
                ) : null}
              </article>
            ))}
            {isSending ? (
              <article className="chat-bubble chat-bubble--agent chat-bubble--typing">
                <LoadingDots />
              </article>
            ) : null}
          </div>

          <form
            className="chat-composer"
            onSubmit={submitQuestion}
          >
            <label className="sr-only" htmlFor="question">
              輸入工作問題
            </label>
            <input
              id="question"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isSending}
              placeholder="詢問完備度、接手下一步、聯絡窗口、文件位置或資產權限"
            />
            <button
              type="submit"
              disabled={isSending}
              aria-label="送出訊息"
            >
              {isSending ? "…" : "→"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
