"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteSidebar } from "./components/site-sidebar";
import type {
  BranchId,
  MindMapBranch,
  MindMapNode,
  MindMapRelation,
  MindMapResult,
} from "../lib/mindmap";

const MAX_BATCH_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

type SelectionSummary = {
  scanned: number;
  skipped: number;
  folderName: string;
  totalBytes: number;
};

const emptyBranches: MindMapBranch[] = [
  {
    id: "tasks",
    category: "project_state",
    eyebrow: "01｜PROJECT STATE",
    title: "專案任務現況",
    summary: "專案目標、進度、任務與下一步。",
    nodes: [],
  },
  {
    id: "decisions",
    category: "decision_context",
    eyebrow: "02｜WHY & PRINCIPLES",
    title: "決策脈絡與核心概念",
    summary: "重要決策、原因、限制與核心原則。",
    nodes: [],
  },
  {
    id: "people",
    category: "people_ownership",
    eyebrow: "03｜PEOPLE & OWNERSHIP",
    title: "人員配置",
    summary: "人員、角色、責任與合作關係。",
    nodes: [],
  },
  {
    id: "history",
    category: "history_risk_error",
    eyebrow: "04｜HISTORY & RISK",
    title: "討論歷史（風險與錯誤）",
    summary: "討論紀錄、風險、事件與處理方式。",
    nodes: [],
  },
];

function MindMapDiagram({
  projectName,
  branches,
  relations,
  selectedBranchId,
  selectedNodeId,
  onSelectBranch,
  onSelectNode,
}: {
  projectName: string;
  branches: MindMapBranch[];
  relations: MindMapRelation[];
  selectedBranchId: BranchId;
  selectedNodeId: string | null;
  onSelectBranch: (id: BranchId) => void;
  onSelectNode: (branchId: BranchId, nodeId: string) => void;
}) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeElements = useMemo(() => new Map<string, HTMLElement>(), []);

  const registerNode = (id: string) => (node: HTMLElement | null) => {
    if (node) nodeElements.set(id, node);
    else nodeElements.delete(id);
  };

  useEffect(() => {
    const diagram = diagramRef.current;
    const canvas = canvasRef.current;
    if (!diagram || !canvas) return;

    const draw = () => {
      const rect = diagram.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      const styles = getComputedStyle(diagram);
      const mainLine = styles.getPropertyValue("--sage").trim() || "#567766";
      const softLine = styles.getPropertyValue("--map-line").trim() || "#b8c8bd";

      const centerOf = (id: string) => {
        const node = nodeElements.get(id);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return {
          x: box.left - rect.left + box.width / 2,
          y: box.top - rect.top + box.height / 2,
        };
      };

      const connect = (fromId: string, toId: string, relation = false) => {
        const from = centerOf(fromId);
        const to = centerOf(toId);
        if (!from || !to) return;
        const dx = to.x - from.x;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.bezierCurveTo(
          from.x + dx * 0.48,
          from.y,
          to.x - dx * 0.48,
          to.y,
          to.x,
          to.y,
        );
        context.strokeStyle = relation ? mainLine : fromId === "project-center" ? mainLine : softLine;
        context.globalAlpha = relation ? 0.34 : fromId === "project-center" ? 0.72 : 0.78;
        context.lineWidth = relation ? 1.3 : fromId === "project-center" ? 2 : 1.25;
        context.setLineDash(relation ? [5, 5] : []);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;
      };

      branches.forEach((branch) => {
        connect("project-center", `branch-${branch.id}`);
        branch.nodes.forEach((node) => connect(`branch-${branch.id}`, `node-${node.id}`));
      });
      relations.forEach((relation) =>
        connect(`node-${relation.from}`, `node-${relation.to}`, true),
      );
    };

    const frame = window.requestAnimationFrame(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(diagram);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [branches, nodeElements, relations, selectedBranchId, selectedNodeId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport && viewport.scrollWidth > viewport.clientWidth) {
        viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const nodeCount = branches.reduce((total, branch) => total + branch.nodes.length, 0);

  return (
    <div className="mindmap-viewport" ref={viewportRef} aria-label={`${projectName} 四類交接知識心智圖`}>
      <div className="mindmap-diagram" ref={diagramRef}>
        <canvas className="mindmap-canvas" ref={canvasRef} aria-hidden="true" />
        <div className="map-ready"><i>✓</i><span>{nodeCount} 個節點已分類</span></div>
        <div className="diagram-center" ref={registerNode("project-center")}>
          <span>PROJECT</span><strong>{projectName}</strong><small>交接知識核心</small>
        </div>

        {branches.map((branch) => (
          <div className={`diagram-branch diagram-${branch.id}`} key={branch.id}>
            <button
              className={`diagram-branch-node ${selectedBranchId === branch.id && !selectedNodeId ? "is-selected" : ""}`}
              ref={registerNode(`branch-${branch.id}`) as React.Ref<HTMLButtonElement>}
              onClick={() => onSelectBranch(branch.id)}
              aria-pressed={selectedBranchId === branch.id && !selectedNodeId}
            >
              <span className="diagram-node-top"><em>{branch.eyebrow.split("｜")[0]}</em><b className="node-count">{branch.nodes.length} 節點</b></span>
              <strong>{branch.title}</strong>
              <small>{branch.summary}</small>
            </button>

            {branch.nodes.map((node, index) => (
              <button
                className={`diagram-leaf diagram-leaf-${index} ${selectedNodeId === node.id ? "is-related" : ""}`}
                key={node.id}
                ref={registerNode(`node-${node.id}`) as React.Ref<HTMLButtonElement>}
                onClick={() => onSelectNode(branch.id, node.id)}
              >
                <span>{node.title}</span><small>{node.sources.length} 個來源定位</small>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectMapPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [selectionSummary, setSelectionSummary] = useState<SelectionSummary | null>(null);
  const [result, setResult] = useState<MindMapResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [showSources, setShowSources] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agentPanelCollapsed, setAgentPanelCollapsed] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<BranchId>("tasks");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapPanelRef = useRef<HTMLElement>(null);

  const branches = result?.branches ?? emptyBranches;
  const selectedBranch =
    branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];
  const selectedNode = useMemo(
    () => selectedBranch.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedBranch, selectedNodeId],
  );
  const nodeCount = branches.reduce((total, branch) => total + branch.nodes.length, 0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(window.localStorage.getItem("handoff-sidebar-collapsed") === "true");
      setAgentPanelCollapsed(window.localStorage.getItem("handoff-agent-panel-collapsed") === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const chooseFiles = (list: FileList | File[] | null) => {
    const scanned = Array.from(list ?? []);
    const accepted: File[] = [];
    let totalBytes = 0;

    for (const file of scanned) {
      const supported = file.name.toLowerCase().endsWith(".docx");
      const fitsFileLimit = file.size > 0 && file.size <= MAX_FILE_SIZE;
      const fitsBatchLimit = accepted.length < MAX_BATCH_FILES && totalBytes + file.size <= MAX_TOTAL_SIZE;
      if (!supported || !fitsFileLimit || !fitsBatchLimit) continue;
      accepted.push(file);
      totalBytes += file.size;
    }

    const firstPath = accepted[0]?.webkitRelativePath || scanned[0]?.webkitRelativePath || "";
    setFiles(accepted);
    setSelectionSummary({
      scanned: scanned.length,
      skipped: scanned.length - accepted.length,
      folderName: firstPath.split("/")[0] || "手動選取的文件",
      totalBytes,
    });
    setResult(null);
    setSelectedNodeId(null);
    setError(
      accepted.length
        ? ""
        : "這個資料夾沒有可處理的 DOCX，或文件超過批次容量限制。",
    );
  };

  const analyze = async () => {
    if (files.length === 0) {
      setError("請先選擇包含 DOCX 的資料夾，或拖入一批 DOCX 文件。");
      return;
    }
    setRunning(true);
    setError("");
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
      formData.append("relativePaths", file.webkitRelativePath || file.name);
    });

    try {
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const payload = (await response.json()) as MindMapResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "無法完成文件分析。");
      }
      const nextResult = payload as MindMapResult;
      setResult(nextResult);
      const firstBranch = nextResult.branches.find((branch) => branch.nodes.length) ?? nextResult.branches[0];
      setSelectedBranchId(firstBranch.id);
      setSelectedNodeId(firstBranch.nodes[0]?.id ?? null);
      window.setTimeout(
        () => mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析時發生未知錯誤。");
    } finally {
      setRunning(false);
    }
  };

  const downloadMap = () => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.project.name}_交接心智圖.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((value) => {
      window.localStorage.setItem("handoff-sidebar-collapsed", String(!value));
      return !value;
    });
  };

  const toggleAgentPanel = () => {
    setAgentPanelCollapsed((value) => {
      window.localStorage.setItem("handoff-agent-panel-collapsed", String(!value));
      return !value;
    });
  };

  const selectBranch = (id: BranchId) => {
    setSelectedBranchId(id);
    setSelectedNodeId(null);
  };

  const selectNode = (branchId: BranchId, nodeId: string) => {
    setSelectedBranchId(branchId);
    setSelectedNodeId(nodeId);
  };

  return (
    <main className={`app-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : ""} ${agentPanelCollapsed ? "is-agent-collapsed" : ""}`}>
      <SiteSidebar active="project-map" collapsed={sidebarCollapsed} onToggle={toggleSidebar}>
        <section className="package-block">
          <div className="section-label"><span>目前資料夾</span><em>{files.length} 份</em></div>
          <h2>{result?.project.name ?? "待選擇文件"}</h2>
          <p>{result ? `${result.meta.evidenceCount} 個內容區塊` : selectionSummary ? selectionSummary.folderName : "選擇一個資料夾開始整理"}</p>
          <div className="file-list">
            {files.slice(0, 8).map((file, index) => (
              <div className="file-item" key={`${file.webkitRelativePath || file.name}-${file.size}`} title={file.webkitRelativePath || file.name}>
                <span className="file-icon">DOC</span>
                <span><b>{file.name.replace(/\.docx$/i, "")}</b><small>{result?.files[index] ? `${result.files[index].tables} 個表格 · 已解析` : `${Math.ceil(file.size / 1024)} KB`}</small></span>
                <i>{result ? "✓" : index + 1}</i>
              </div>
            ))}
            {files.length > 8 && <div className="file-overflow">另有 {files.length - 8} 份文件</div>}
          </div>
        </section>
      </SiteSidebar>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">交接資料包 <i>/</i> {result?.project.name ?? "新分析"}</span>
            <h1>交接知識心智圖</h1>
          </div>
          <div className="top-actions">
            {result && <button className="ghost-button" onClick={() => setShowSources((value) => !value)}>{showSources ? "隱藏來源" : "顯示來源"}</button>}
            <button className="ghost-button" onClick={() => inputRef.current?.click()}>選擇資料夾</button>
            <button className="primary-button" onClick={analyze} disabled={running || files.length === 0}>{running ? "正在分類內容…" : result ? "重新建立" : "建立心智圖"}</button>
          </div>
          <input
            className="file-picker"
            ref={(node) => {
              inputRef.current = node;
              node?.setAttribute("webkitdirectory", "");
              node?.setAttribute("directory", "");
            }}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={(event) => {
              chooseFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </header>

        <div className="content-scroll">
          {!result && (
            <section className="upload-card">
              <span className="eyebrow">RUNTIME DOCX CLASSIFICATION</span>
              <h2>把整個交接資料夾，整理成四類知識地圖。</h2>
              <p>不需要先整理檔名或分類。系統會掃描資料夾內的 DOCX，略過不支援的格式，再依文件內容建立節點與關係；此階段不評分，也不檢查缺漏。</p>
              <button
                className="upload-drop"
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseFiles(event.dataTransfer.files);
                }}
              >
                <span className="upload-symbol">⌑</span>
                <strong>{files.length ? `已找到 ${files.length} 份可處理文件` : "選擇整個資料夾"}</strong>
                <small>也可以拖入多份 DOCX · 最多 50 份、單檔 10 MB、整批 50 MB</small>
              </button>
              {selectionSummary && (
                <div className="scan-summary" aria-live="polite">
                  <span><b>{selectionSummary.scanned}</b> 個檔案已掃描</span>
                  <span><b>{files.length}</b> 份 DOCX 將處理</span>
                  <span><b>{selectionSummary.skipped}</b> 個檔案已略過</span>
                  <span><b>{(selectionSummary.totalBytes / 1024 / 1024).toFixed(1)}</b> MB</span>
                </div>
              )}
              {files.length > 0 && (
                <div className="file-selection">
                  {files.slice(0, 12).map((file, index) => <span key={`${file.webkitRelativePath || file.name}-${file.size}`} title={file.webkitRelativePath || file.name}><b>{index + 1}</b>{file.webkitRelativePath || file.name}</span>)}
                  {files.length > 12 && <span className="selection-overflow"><b>＋</b>另有 {files.length - 12} 份 DOCX 將一併處理</span>}
                </div>
              )}
              <div className="upload-actions">
                <button className="primary-button" type="button" disabled={running || files.length === 0} onClick={analyze}>{running ? "正在解析與分類…" : "建立心智圖"}</button>
                <small>需要在伺服器設定 OPENAI_API_KEY</small>
              </div>
            </section>
          )}

          {error && <div className="error-banner" role="alert"><b>目前無法完成</b><span>{error}</span></div>}

          {result && (
            <>
              <section className="overview-card">
                <div className="overview-copy">
                  <span className="eyebrow">CLASSIFIED KNOWLEDGE MAP</span>
                  <h2>{result.project.name}</h2>
                  <p>{result.files.length} 份文件已完成解析，內容依四個交接主題分類；點選節點即可查看摘要、細節與原始文件位置。</p>
                  <div className="overview-meta">
                    <span><b>{result.files.length}</b> 份文件</span><span><b>{result.files.reduce((total, file) => total + file.tables, 0)}</b> 個表格</span><span><b>{nodeCount}</b> 個節點</span>
                  </div>
                </div>
                <div className="node-orbit" aria-label={`共 ${nodeCount} 個心智圖節點`}><strong>{nodeCount}</strong><small>分類節點</small></div>
              </section>

              <section className="map-panel" ref={mapPanelRef}>
                <div className="panel-heading">
                  <div><span className="eyebrow">KNOWLEDGE MAP</span><h2>四大核心元素</h2></div>
                  <div className="map-tools">
                    <div className="legend"><span><i className="dot good"></i>分類節點</span><span><i className="relation-dot"></i>文件關係</span></div>
                    <button className="download-button" onClick={downloadMap}>下載心智圖 JSON</button>
                  </div>
                </div>
                <MindMapDiagram
                  projectName={result.project.name}
                  branches={branches}
                  relations={result.relations}
                  selectedBranchId={selectedBranchId}
                  selectedNodeId={selectedNodeId}
                  onSelectBranch={selectBranch}
                  onSelectNode={selectNode}
                />
                {result.relations.length > 0 && (
                  <div className="relation-list">
                    <span className="eyebrow">DOCUMENT RELATIONS</span>
                    {result.relations.map((relation, index) => <span key={`${relation.from}-${relation.to}-${index}`}>{relation.label}</span>)}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>

      <aside className="agent-panel" aria-label="心智圖節點詳情">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar"><span></span></div>
            <div className="agent-header-copy"><strong>內容分類 Agent</strong><small><i></i>{running ? "正在解析與分類" : result ? "心智圖已建立" : "等待交接資料夾"}</small></div>
          </div>
          <button className="agent-panel-toggle" type="button" onClick={toggleAgentPanel} aria-label={agentPanelCollapsed ? "展開右側 Agent 面板" : "收合右側 Agent 面板"} aria-expanded={!agentPanelCollapsed}>
            <span aria-hidden="true">{agentPanelCollapsed ? "‹" : "›"}</span>
          </button>
        </div>

        <div className="agent-scroll">
          <section className="selected-summary">
            <div className="summary-top"><span className="eyebrow">{selectedNode ? "目前節點" : "目前分類"}</span><span className="node-count detail-count">{selectedNode ? selectedNode.sources.length : selectedBranch.nodes.length}</span></div>
            <h2>{selectedNode?.title ?? selectedBranch.title}</h2>
            <p>{selectedNode?.summary ?? selectedBranch.summary}</p>
          </section>

          {selectedNode ? (
            <NodeDetails node={selectedNode} showSources={showSources} />
          ) : (
            <section className="detail-section">
              <h3><span className="tiny-icon check">✓</span>已分類節點</h3>
              {selectedBranch.nodes.length ? (
                <div className="branch-node-list">
                  {selectedBranch.nodes.map((node) => (
                    <button key={node.id} onClick={() => selectNode(selectedBranch.id, node.id)}><b>{node.title}</b><span>{node.summary}</span></button>
                  ))}
                </div>
              ) : <p className="empty-detail">尚未從文件辨識出此類內容。</p>}
            </section>
          )}
        </div>
        <div className="analysis-note"><b>分類模式</b><span>只整理文件既有內容，不評分、不補寫缺漏。</span></div>
      </aside>
    </main>
  );
}

const modules = [
  {
    id: "project-map",
    number: "01",
    icon: "⌘",
    title: "企劃地圖",
    description: "把交接文件整理成可追溯的任務、人員、決策與歷史脈絡。",
    href: "/project-map",
    status: "立即使用",
    available: true,
  },
  {
    id: "onboarding-roadmap",
    number: "02",
    icon: "↗",
    title: "新人上手路線圖",
    description: "依照優先順序安排閱讀、認識關係人與實作任務。",
    href: "/onboarding-roadmap",
    status: "接口已預留",
    available: false,
  },
  {
    id: "risk-management",
    number: "03",
    icon: "△",
    title: "風險知識管理",
    description: "集中查看待確認事項、歷史風險與建議處理順序。",
    href: "/risk-management",
    status: "接口已預留",
    available: false,
  },
] as const;

export default function Home() {
  return (
    <div className="site-portal-shell">
      <SiteSidebar active="existing-data" />
      <main className="welcome-page">
      <header className="welcome-header">
        <div className="welcome-context"><span className="eyebrow">INSIGHTSHIFT</span><strong>現有資料</strong></div>
        <span className="welcome-role"><i aria-hidden="true"></i>新人工作台</span>
      </header>

      <section className="welcome-stage" aria-labelledby="welcome-title">
        <div className="welcome-orbit orbit-one" aria-hidden="true"></div>
        <div className="welcome-orbit orbit-two" aria-hidden="true"></div>
        <div className="welcome-intro">
          <span className="eyebrow">GREETING · 歡迎加入團隊</span>
          <h1 id="welcome-title">重要的脈絡，<br />都幫你接好了。</h1>
          <p>不用一次看完。選一個入口，從現在最需要理解的事情開始。</p>
        </div>

        <div className="welcome-question">
          <span className="question-line" aria-hidden="true"></span>
          <div>
            <span className="eyebrow">CHOOSE A STARTING POINT</span>
            <h2>現在想從哪裡開始？</h2>
          </div>
          <span className="question-line" aria-hidden="true"></span>
        </div>

        <div className="module-grid">
          {modules.map((module) => (
            <Link
              className={`module-card module-${module.id} ${module.available ? "is-available" : "is-reserved"}`}
              href={module.href}
              key={module.id}
              aria-label={`${module.title}，${module.status}`}
            >
              <div className="module-card-top">
                <span className="module-number">{module.number}</span>
                <span className="module-status">{module.status}</span>
              </div>
              <span className="module-icon" aria-hidden="true">{module.icon}</span>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <span className="module-action">{module.available ? "開始整理" : "查看預留頁"}<i aria-hidden="true">→</i></span>
            </Link>
          ))}
        </div>

        <div className="choice-divider" aria-hidden="true"><span></span><b>或者</b><span></span></div>

        <Link className="assistant-entry" href="/assistant" aria-label="開啟輔助對話，接口已預留">
          <span className="assistant-symbol" aria-hidden="true">✦</span>
          <span className="assistant-copy">
            <small>還不確定從哪開始？</small>
            <strong>和無痛交接小幫手聊聊</strong>
          </span>
          <span className="assistant-prompt">描述你現在想了解的事</span>
          <span className="assistant-arrow" aria-hidden="true">→</span>
        </Link>

        <p className="welcome-footnote">企劃地圖已可使用，其餘模組已保留獨立路徑，後續功能可直接接入。</p>
      </section>
      </main>
    </div>
  );
}

function NodeDetails({ node, showSources }: { node: MindMapNode; showSources: boolean }) {
  return (
    <>
      <section className="detail-section">
        <h3><span className="tiny-icon check">✓</span>文件內容</h3>
        {node.details.length ? <ul className="fact-list">{node.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : <p className="empty-detail">此節點沒有額外細節。</p>}
      </section>
      {showSources && (
        <section className="detail-section source-section">
          <h3><span className="tiny-icon source">↗</span>原始位置</h3>
          {node.sources.length ? node.sources.map((source) => (
            <div className="source-chip" key={source.evidenceId}><span>DOC</span><p>{source.fileName}<small>{source.locator}</small></p></div>
          )) : <p className="empty-detail">此節點沒有可顯示的來源定位。</p>}
        </section>
      )}
    </>
  );
}
