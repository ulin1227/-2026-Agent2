export const categoryOrder = [
  "project_state",
  "decision_context",
  "people_ownership",
  "history_risk_error",
] as const;

export type Category = (typeof categoryOrder)[number];
export type BranchId = "tasks" | "decisions" | "people" | "history";

export type EvidenceBlock = {
  id: string;
  fileName: string;
  locator: string;
  kind: "paragraph" | "table_row";
  text: string;
};

export type ParsedDocument = {
  fileName: string;
  paragraphCount: number;
  tableCount: number;
  blocks: EvidenceBlock[];
};

export type MindMapSource = {
  evidenceId: string;
  fileName: string;
  locator: string;
};

export type MindMapNode = {
  id: string;
  category: Category;
  title: string;
  summary: string;
  details: string[];
  sources: MindMapSource[];
};

export type MindMapBranch = {
  id: BranchId;
  category: Category;
  eyebrow: string;
  title: string;
  summary: string;
  nodes: MindMapNode[];
};

export type MindMapRelation = {
  from: string;
  to: string;
  label: string;
};

export type MindMapResult = {
  project: { name: string };
  branches: MindMapBranch[];
  relations: MindMapRelation[];
  files: Array<{
    name: string;
    paragraphs: number;
    tables: number;
    evidenceBlocks: number;
  }>;
  meta: {
    model: string;
    evidenceCount: number;
    generatedAt: string;
  };
  ingestion?: {
    scannedFiles: number;
    processedFiles: number;
    skippedFiles: number;
  };
};

export type AgentNode = {
  key: string;
  category: Category;
  title: string;
  summary: string;
  details: string[];
  sourceIds: string[];
};

export type AgentClassification = {
  projectName: string;
  nodes: AgentNode[];
  relations: Array<{ fromKey: string; toKey: string; label: string }>;
};

export const branchDefinitions: Record<
  Category,
  Pick<MindMapBranch, "id" | "eyebrow" | "title">
> = {
  project_state: {
    id: "tasks",
    eyebrow: "01｜PROJECT STATE",
    title: "專案任務現況",
  },
  decision_context: {
    id: "decisions",
    eyebrow: "02｜WHY & PRINCIPLES",
    title: "決策脈絡與核心概念",
  },
  people_ownership: {
    id: "people",
    eyebrow: "03｜PEOPLE & OWNERSHIP",
    title: "人員配置",
  },
  history_risk_error: {
    id: "history",
    eyebrow: "04｜HISTORY & RISK",
    title: "討論歷史（風險與錯誤）",
  },
};

export const classificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["projectName", "nodes", "relations"],
  properties: {
    projectName: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "category",
          "title",
          "summary",
          "details",
          "sourceIds",
        ],
        properties: {
          key: { type: "string" },
          category: { type: "string", enum: categoryOrder },
          title: { type: "string" },
          summary: { type: "string" },
          details: { type: "array", items: { type: "string" } },
          sourceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fromKey", "toKey", "label"],
        properties: {
          fromKey: { type: "string" },
          toKey: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && categoryOrder.includes(value as Category);
}

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function parseAgentClassification(value: unknown): AgentClassification {
  if (!value || typeof value !== "object") {
    throw new Error("Agent 回傳的資料不是物件。");
  }

  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.nodes) || !Array.isArray(input.relations)) {
    throw new Error("Agent 回傳缺少 nodes 或 relations。");
  }

  const nodes: AgentNode[] = input.nodes.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as Record<string, unknown>;
    if (
      typeof node.key !== "string" ||
      typeof node.title !== "string" ||
      typeof node.summary !== "string" ||
      !isCategory(node.category)
    ) {
      return [];
    }
    return [
      {
        key: node.key.trim().slice(0, 80),
        category: node.category,
        title: node.title.trim().slice(0, 80),
        summary: node.summary.trim().slice(0, 240),
        details: strings(node.details, 6, 180),
        sourceIds: strings(node.sourceIds, 8, 100),
      },
    ];
  });

  const relations = input.relations.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const relation = item as Record<string, unknown>;
    if (
      typeof relation.fromKey !== "string" ||
      typeof relation.toKey !== "string" ||
      typeof relation.label !== "string"
    ) {
      return [];
    }
    return [
      {
        fromKey: relation.fromKey.trim().slice(0, 80),
        toKey: relation.toKey.trim().slice(0, 80),
        label: relation.label.trim().slice(0, 80),
      },
    ];
  });

  return {
    projectName:
      typeof input.projectName === "string" && input.projectName.trim()
        ? input.projectName.trim().slice(0, 100)
        : "未命名交接專案",
    nodes,
    relations,
  };
}

function safeId(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

export function buildMindMap(
  classification: AgentClassification,
  documents: ParsedDocument[],
  model: string,
): MindMapResult {
  const evidence = new Map(
    documents.flatMap((document) => document.blocks).map((block) => [block.id, block]),
  );
  const keyToId = new Map<string, string>();
  const usedIds = new Set<string>();

  const normalizedNodes = classification.nodes.map((node, index): MindMapNode => {
    const base = safeId(node.key, `node-${index + 1}`);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    keyToId.set(node.key, id);

    const sources = node.sourceIds.flatMap((sourceId) => {
      const block = evidence.get(sourceId);
      return block
        ? [
            {
              evidenceId: block.id,
              fileName: block.fileName,
              locator: block.locator,
            },
          ]
        : [];
    });

    return {
      id,
      category: node.category,
      title: node.title,
      summary: node.summary,
      details: node.details,
      sources,
    };
  });

  const branches = categoryOrder.map((category): MindMapBranch => {
    const definition = branchDefinitions[category];
    const nodes = normalizedNodes.filter((node) => node.category === category).slice(0, 4);
    return {
      ...definition,
      category,
      summary: nodes.length
        ? `${nodes.length} 個已分類節點，點選即可查看內容。`
        : "目前文件中沒有辨識到此類內容。",
      nodes,
    };
  });

  const visibleNodeIds = new Set(branches.flatMap((branch) => branch.nodes.map((node) => node.id)));
  const relations = classification.relations.flatMap((relation) => {
    const from = keyToId.get(relation.fromKey);
    const to = keyToId.get(relation.toKey);
    return from && to && from !== to && visibleNodeIds.has(from) && visibleNodeIds.has(to)
      ? [{ from, to, label: relation.label }]
      : [];
  });

  return {
    project: { name: classification.projectName },
    branches,
    relations,
    files: documents.map((document) => ({
      name: document.fileName,
      paragraphs: document.paragraphCount,
      tables: document.tableCount,
      evidenceBlocks: document.blocks.length,
    })),
    meta: {
      model,
      evidenceCount: evidence.size,
      generatedAt: new Date().toISOString(),
    },
  };
}
