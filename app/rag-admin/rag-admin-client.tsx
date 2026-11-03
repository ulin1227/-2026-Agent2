"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatGPTUser } from "../chatgpt-auth";
import type { AdminOverview } from "../../lib/rag/admin-overview";
import styles from "./rag-admin.module.css";

interface QueryResponse {
  answer: string;
  answerGenerated: boolean;
  retrievalStrategy: string;
  evidence: Array<{
    chunkId: string;
    text: string;
    score: number;
    ranking?: {
      fusedRank: number; queryType: string; lexicalWeight: number; vectorWeight: number; focusWeight?: number;
      lexicalRank: number | null; vectorRank: number | null;
      lexicalContribution: number; vectorContribution: number;
    };
    citation: { fileName: string; locator: string; chunkIndex: number };
  }>;
}

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Project ORBIT handoff documents served from public/demo, indexed automatically when the index is empty.
const DEMO_DOCUMENTS = [
  "01_業務內容交接_Project_ORBIT.docx",
  "02_人際關係交接_Project_ORBIT.docx",
  "03_公司資產交接_Project_ORBIT.docx",
];
const DEFAULT_QUESTION = "ORBIT 專案目前最需要注意的風險是什麼？";

function formatDate(value: string | null): string {
  if (!value) return "尚無紀錄";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

export function RagAdminClient({
  initialAdmin,
  initialOverview,
  localDevelopment,
}: {
  initialAdmin: ChatGPTUser;
  initialOverview: AdminOverview;
  localDevelopment: boolean;
}) {
  const [projectId, setProjectId] = useState("project-orbit");
  const [overview, setOverview] = useState<AdminOverview | null>(initialOverview);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<"load" | "sync" | "upload" | "query" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const demoRequestedRef = useRef(false);

  const loadOverview = useCallback(async (selectedProject = projectId) => {
    setBusy("load");
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedProject.trim()) params.set("projectId", selectedProject.trim());
      const response = await fetch(`/api/admin/rag/overview?${params}`, { cache: "no-store" });
      const payload = await response.json() as AdminOverview | { error?: string };
      if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "無法讀取 RAG 狀態。");
      setOverview(payload as AdminOverview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法讀取 RAG 狀態。");
    } finally {
      setBusy(null);
    }
  }, [projectId]);

  const syncKnowledge = async () => {
    setBusy("sync");
    setError("");
    try {
      const response = await fetch("/api/knowledge/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: projectId.trim(), source: { type: "local-folder", scope: "." } }),
      });
      const payload = await response.json() as { error?: string };
      if (response.status === 503) {
        // Local folder access is unavailable in the Workers runtime; index the bundled demo documents instead.
        setBusy(null);
        await loadDemoDocuments();
        setNotice("此執行環境無法讀取本機資料夾，已改為載入 Project ORBIT 示範文件。");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "同步失敗。");
      await loadOverview(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "同步失敗。");
      setBusy(null);
    }
  };

  const uploadDocuments = async (files: File[], targetProject = projectId.trim()) => {
    setBusy("upload");
    setError("");
    setNotice("");
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("projectId", targetProject);
        form.append("relativePath", file.name);
        form.append("file", file);
        const response = await fetch("/api/knowledge/documents", { method: "POST", body: form });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(`${file.name}：${payload.error || "上傳失敗。"}`);
      }
      setNotice(`已建立 ${files.length} 份文件的索引。`);
      await loadOverview(targetProject);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上傳失敗。");
      setBusy(null);
      return false;
    }
  };

  const loadDemoDocuments = async () => {
    try {
      const files = await Promise.all(DEMO_DOCUMENTS.map(async (name) => {
        const response = await fetch(`/demo/orbit/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error(`無法讀取示範文件 ${name}`);
        return new File([await response.blob()], name, { type: DOCX_MIME_TYPE });
      }));
      if (await uploadDocuments(files, "project-orbit")) {
        setProjectId("project-orbit");
        await runQuery(DEFAULT_QUESTION, "project-orbit");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法載入示範文件。");
      setBusy(null);
    }
  };

  useEffect(() => {
    if (demoRequestedRef.current || initialOverview.documents.length > 0) return;
    demoRequestedRef.current = true;
    void loadDemoDocuments();
    // Runs once on first render with an empty index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runQuery = async (questionText = question.trim(), targetProject = projectId.trim()) => {
    setBusy("query");
    setError("");
    try {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: targetProject, question: questionText, topK: 5 }),
      });
      const payload = await response.json() as QueryResponse | { error?: string };
      if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "查詢失敗。");
      setQueryResult(payload as QueryResponse);
      await loadOverview(targetProject);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "查詢失敗。");
      setBusy(null);
    }
  };

  const visibleChunks = useMemo(() => {
    const keyword = filter.trim().toLocaleLowerCase();
    if (!keyword) return overview?.chunks ?? [];
    return (overview?.chunks ?? []).filter((chunk) =>
      `${chunk.fileName} ${chunk.locator} ${chunk.text}`.toLocaleLowerCase().includes(keyword));
  }, [filter, overview]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>INSIGHTSHIFT · ADMIN ONLY</span>
          <h1>RAG 管理控制台</h1>
          <p>檢查索引內容、執行檢索，並追蹤每次 evidence 命中。</p>
        </div>
        <div className={styles.identity}>
          <span>{localDevelopment ? "LOCAL ADMIN" : "AUTHORIZED ADMIN"}</span>
          <strong>{initialAdmin.displayName}</strong>
          <small>{initialAdmin.email}</small>
          <Link href="/supervisor/create">返回主管工作台</Link>
        </div>
      </header>

      <section className={styles.toolbar}>
        <label>
          <span>專案 ID</span>
          <input value={projectId} onChange={(event) => setProjectId(event.target.value)} maxLength={120} />
        </label>
        <button type="button" onClick={() => void loadOverview()} disabled={busy !== null}>重新整理</button>
        <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={busy !== null || !projectId.trim()}>
          {busy === "upload" ? "上傳中…" : "上傳 DOCX"}
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept={`.docx,${DOCX_MIME_TYPE}`}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.currentTarget.value = "";
            if (files.length) void uploadDocuments(files);
          }}
        />
        <button className={styles.primary} type="button" onClick={syncKnowledge} disabled={busy !== null || !projectId.trim()}>
          {busy === "sync" ? "同步中…" : "同步本機知識庫"}
        </button>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && !error && <div className={styles.notice} role="status">{notice}</div>}

      <section className={styles.metrics} aria-label="RAG 狀態摘要">
        <article><span>文件</span><strong>{overview?.counts.documents ?? "—"}</strong><small>已建立索引</small></article>
        <article><span>Chunks</span><strong>{overview?.counts.chunks ?? "—"}</strong><small>可檢索片段</small></article>
        <article><span>檢索紀錄</span><strong>{overview?.counts.retrievals ?? "—"}</strong><small>{overview?.status.auditStorage ?? "—"} 儲存</small></article>
        <article className={overview?.status.embeddingConfigured ? styles.healthy : styles.warning}>
          <span>Embedding</span><strong>{overview?.status.embeddingConfigured ? "READY" : "CHECK"}</strong><small>{overview?.status.embeddingModel ?? "尚未設定"}</small>
        </article>
      </section>

      <section className={styles.statusPanel}>
        <div><span>Retrieval mode</span><strong>{overview?.status.retrievalMode ?? "—"}</strong></div>
        <div><span>Strategy</span><strong>{overview?.status.strategy ?? "—"}</strong></div>
        <div><span>Embedding endpoint</span><strong>{overview?.status.embeddingHost ?? "—"}</strong></div>
        <div><span>最近索引</span><strong>{formatDate(overview?.status.lastIndexedAt ?? null)}</strong></div>
        {overview?.status.indexStorage === "memory" && <p>目前索引存在程序記憶體；重啟後需要重新同步。部署版檢索紀錄可使用 D1 保存。</p>}
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><span>LIVE RETRIEVAL</span><h2>RAG 查詢</h2></div></div>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} maxLength={2000} />
          <button className={styles.primary} type="button" onClick={() => void runQuery()} disabled={busy !== null || !question.trim() || !projectId.trim()}>
            {busy === "query" ? "檢索中…" : "執行 Top-5 檢索"}
          </button>
          {queryResult && (
            <div className={styles.results}>
              <div className={styles.resultMeta}><span>{queryResult.retrievalStrategy}</span><strong>{queryResult.evidence.length} 筆 evidence</strong></div>
              {queryResult.evidence.map((hit, index) => (
                <article key={hit.chunkId}>
                  <div><b>#{index + 1}</b><strong>{hit.citation.fileName}</strong><small>{hit.citation.locator}</small></div>
                  <p>{hit.text}</p>
                  <footer>
                    <span>score {hit.score.toFixed(6)}</span>
                    {hit.ranking && <span>{hit.ranking.queryType} · L/V/F {hit.ranking.lexicalWeight}/{hit.ranking.vectorWeight}/{hit.ranking.focusWeight ?? 0} · rank {hit.ranking.lexicalRank ?? "—"}/{hit.ranking.vectorRank ?? "—"}</span>}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><span>INDEXED DOCUMENTS</span><h2>現有資料</h2></div><em>{overview?.documents.length ?? 0} 份</em></div>
          <div className={styles.documents}>
            {(overview?.documents ?? []).map((document) => (
              <article key={document.documentId}>
                <span>DOCX</span><div><strong>{document.fileName}</strong><small>{document.chunkCount} chunks · {formatBytes(document.size)} · checksum {document.checksumPrefix}</small></div>
              </article>
            ))}
            {overview && overview.documents.length === 0 && <p className={styles.empty}>{busy === "upload" ? "正在載入 Project ORBIT 示範文件…" : "尚未同步此專案的文件。"}</p>}
          </div>
          <label className={styles.search}><span>搜尋 chunk 內容</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="檔名、locator 或文字" /></label>
          <div className={styles.chunks}>
            {visibleChunks.map((chunk) => (
              <details key={chunk.chunkId}>
                <summary><span>#{chunk.chunkIndex + 1}</span><strong>{chunk.fileName}</strong><small>{chunk.locator}</small></summary>
                <p>{chunk.text}</p>
                <footer>{chunk.kind} · {chunk.chunkId}</footer>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section className={`${styles.panel} ${styles.auditPanel}`}>
        <div className={styles.panelHeading}><div><span>RETRIEVAL AUDIT</span><h2>檢索紀錄</h2></div><em>最近 50 筆</em></div>
        <div className={styles.auditTable}>
          <div className={styles.auditHead}><span>時間／提問者</span><span>問題</span><span>策略</span><span>效能／結果</span></div>
          {(overview?.retrievals ?? []).map((record) => (
            <details key={record.id}>
              <summary>
                <span>{formatDate(record.createdAt)}<small>{record.actorEmail ?? "anonymous"}</small></span>
                <strong>{record.question}</strong>
                <span>{record.strategy}<small>{record.queryType ? `${record.queryType} · ${record.lexicalWeight}/${record.vectorWeight}` : "single retriever"}</small></span>
                <span>{record.latencyMs.toFixed(1)} ms<small>{record.resultCount}/{record.topK} hits</small></span>
              </summary>
              <div>{record.citations.map((citation) => <p key={`${record.id}-${citation.rank}`}><b>#{citation.rank}</b>{citation.fileName}<small>{citation.locator}</small></p>)}</div>
            </details>
          ))}
          {overview && overview.retrievals.length === 0 && <p className={styles.empty}>尚無檢索紀錄；可從上方送出第一個問題。</p>}
        </div>
      </section>
    </main>
  );
}
