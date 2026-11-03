import type { Source } from "@/shared/data/fm06";

export type CommunicationRecord = {
  id: string;
  source: "notion" | "slack";
  authorId: string;
  authorName: string;
  projectId: string;
  text: string;
  timestamp: string;
  threadTitle: string;
  permissionScope: "project" | "team" | "private";
};

export type WorkspaceConnectorStatus = {
  name: "notion" | "slack";
  status: "ready" | "empty" | "pending";
  records: number;
  note: string;
};

export type WorkspaceContext = {
  records: CommunicationRecord[];
  handoffSources: Source[];
  statuses: WorkspaceConnectorStatus[];
};

type WorkspaceContextParams = {
  projectId: string;
  seniorId: string;
};

type SlackMessage = {
  type?: string;
  user?: string;
  username?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
};

type SlackMessageResponse = {
  ok?: boolean;
  messages?: SlackMessage[];
  has_more?: boolean;
  response_metadata?: {
    next_cursor?: string;
  };
};

type NotionRichText = {
  plain_text?: string;
};

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  paragraph?: { rich_text?: NotionRichText[] };
  heading_1?: { rich_text?: NotionRichText[] };
  heading_2?: { rich_text?: NotionRichText[] };
  heading_3?: { rich_text?: NotionRichText[] };
  bulleted_list_item?: { rich_text?: NotionRichText[] };
  numbered_list_item?: { rich_text?: NotionRichText[] };
  to_do?: { rich_text?: NotionRichText[]; checked?: boolean };
  callout?: { rich_text?: NotionRichText[] };
  quote?: { rich_text?: NotionRichText[] };
  toggle?: { rich_text?: NotionRichText[] };
  code?: { rich_text?: NotionRichText[] };
  child_page?: { title?: string };
  table_row?: { cells?: NotionRichText[][] };
};

type NotionBlocksResponse = {
  results?: NotionBlock[];
  has_more?: boolean;
  next_cursor?: string;
};

type NotionPage = {
  id: string;
  last_edited_time?: string;
  created_time?: string;
  properties?: Record<string, unknown>;
};

const mockCommunicationRecords: CommunicationRecord[] = [
  {
    id: "slack-orbit-001",
    source: "slack",
    authorId: "senior-lin",
    authorName: "林書妍",
    projectId: "fm06",
    threadTitle: "Project ORBIT UAT 交接",
    timestamp: "2026-07-22T10:18:00+08:00",
    permissionScope: "project",
    text:
      "接手第一步先看 UAT 阻塞問題 owner，再確認 SSO 測試報告和發票下載測試，不要先跳到上線排程。",
  },
  {
    id: "notion-orbit-002",
    source: "notion",
    authorId: "senior-lin",
    authorName: "林書妍",
    projectId: "fm06",
    threadTitle: "交接文件完備性備忘",
    timestamp: "2026-07-22T14:32:00+08:00",
    permissionScope: "team",
    text:
      "確認表寫已確認不能直接當證據。要回到業務內容、人際關係、公司資產三份文件，逐項看明細有沒有 owner、日期、下一步和完成標準。",
  },
  {
    id: "slack-orbit-003",
    source: "slack",
    authorId: "senior-lin",
    authorName: "林書妍",
    projectId: "fm06",
    threadTitle: "安全與客戶承諾提醒",
    timestamp: "2026-07-23T17:05:00+08:00",
    permissionScope: "project",
    text:
      "密碼和憑證不能放交接文件。遇到客戶承諾、合約、資料錯配或資安問題，先整理現況和來源，再升級給許雅婷決策。",
  },
  {
    id: "notion-orbit-004",
    source: "notion",
    authorId: "senior-lin",
    authorName: "林書妍",
    projectId: "fm06",
    threadTitle: "新人上手順序",
    timestamp: "2026-07-24T09:40:00+08:00",
    permissionScope: "team",
    text:
      "新人第一天不用把所有文件背完。先確認 B2 接手行動、P2 聯絡時機、A2 取得方式；這三項能行動，工作就不會卡住。",
  },
];

function splitEnvList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNotionId(value: string) {
  const input = value.trim();
  const dashedUuid = input.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  )?.[0];
  if (dashedUuid) return dashedUuid;

  const compactUuid = input.match(/[0-9a-fA-F]{32}/g)?.at(-1);
  if (!compactUuid) return input;

  return [
    compactUuid.slice(0, 8),
    compactUuid.slice(8, 12),
    compactUuid.slice(12, 16),
    compactUuid.slice(16, 20),
    compactUuid.slice(20),
  ].join("-");
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolFromEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (!value) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function truncateText(text: string, maxChars = numberFromEnv("CONNECTOR_TEXT_MAX_CHARS", 1200)) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("Workspace connector request failed", response.status, url);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn("Workspace connector request error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function projectMatches(text: string, projectId: string) {
  const projectKey = process.env.NOTION_PROJECT_KEY ?? "Project ORBIT";
  const normalized = text.toLowerCase();
  return normalized.includes(projectId.toLowerCase()) || normalized.includes(projectKey.toLowerCase());
}

function cleanSlackText(text: string | undefined) {
  return (text ?? "")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function isReadableSlackMessage(message: SlackMessage) {
  return Boolean(cleanSlackText(message.text)) && !message.bot_id && !message.subtype;
}

function slackAuthorMatches(message: SlackMessage, seniorUserIds: string[]) {
  return Boolean(message.user && seniorUserIds.includes(message.user));
}

function slackToneContextMatches(text: string, projectId: string) {
  const keywords = splitEnvList(process.env.SLACK_TONE_KEYWORDS ?? process.env.SLACK_PROJECT_KEYWORDS);
  if (!keywords.length) return projectMatches(text, projectId);

  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function slackTimestampToIso(ts: string | undefined) {
  const seconds = Number((ts ?? "").split(".")[0]);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

async function fetchSlackMessages(params: {
  token: string;
  channelId: string;
  method: "conversations.history" | "conversations.replies";
  timeoutMs: number;
  limit: number;
  oldest?: number;
  ts?: string;
}) {
  const messages: SlackMessage[] = [];
  const maxPages = numberFromEnv("SLACK_MAX_PAGES", 2);
  let cursor = "";

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`https://slack.com/api/${params.method}`);
    url.searchParams.set("channel", params.channelId);
    url.searchParams.set("limit", String(params.limit));
    if (params.oldest) url.searchParams.set("oldest", String(params.oldest));
    if (params.ts) url.searchParams.set("ts", params.ts);
    if (cursor) url.searchParams.set("cursor", cursor);

    const body = await fetchJson<SlackMessageResponse>(
      url.toString(),
      {
        headers: {
          authorization: `Bearer ${params.token}`,
        },
      },
      params.timeoutMs,
    );

    if (!body?.ok || !Array.isArray(body.messages)) break;
    messages.push(...body.messages);

    cursor = body.response_metadata?.next_cursor ?? "";
    if (!body.has_more || !cursor) break;
  }

  return messages;
}

function pushSlackRecord(params: {
  records: CommunicationRecord[];
  seen: Set<string>;
  channelId: string;
  message: SlackMessage;
  request: WorkspaceContextParams;
  threadTitle: string;
  text: string;
}) {
  const recordId = `slack-${params.channelId}-${params.message.ts ?? params.records.length}`;
  if (params.seen.has(recordId)) return;
  params.seen.add(recordId);

  params.records.push({
    id: recordId,
    source: "slack",
    authorId: params.request.seniorId,
    authorName: process.env.SLACK_SENIOR_DISPLAY_NAME ?? params.message.username ?? "前同事",
    projectId: params.request.projectId,
    threadTitle: params.threadTitle,
    timestamp: slackTimestampToIso(params.message.ts),
    permissionScope: "project",
    text: truncateText(params.text),
  });
}

async function fetchSlackRecords(params: WorkspaceContextParams): Promise<{
  records: CommunicationRecord[];
  usedLive: boolean;
}> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelIds = splitEnvList(process.env.SLACK_TONE_CHANNEL_IDS ?? process.env.SLACK_CHANNEL_IDS);
  if (!token || !channelIds.length || params.seniorId === "default") {
    return { records: [], usedLive: false };
  }

  const seniorUserIds = splitEnvList(
    process.env.SLACK_TONE_USER_IDS ?? process.env.SLACK_SENIOR_USER_IDS ?? process.env.SLACK_SENIOR_USER_ID,
  );
  if (!seniorUserIds.length) return { records: [], usedLive: true };

  const lookbackDays = numberFromEnv("SLACK_LOOKBACK_DAYS", 60);
  const limit = numberFromEnv("SLACK_LIMIT", 50);
  const threadLimit = numberFromEnv("SLACK_THREAD_REPLY_LIMIT", 50);
  const timeoutMs = numberFromEnv("CONNECTOR_TIMEOUT_MS", 8000);
  const includeThreads = boolFromEnv("SLACK_INCLUDE_THREADS", true);
  const maxRecords = numberFromEnv("WORKSPACE_TONE_RECORD_LIMIT", 16);
  const oldest = Math.floor(Date.now() / 1000 - lookbackDays * 24 * 60 * 60);
  const records: CommunicationRecord[] = [];
  const seen = new Set<string>();

  for (const channelId of channelIds) {
    const messages = await fetchSlackMessages({
      token,
      channelId,
      method: "conversations.history",
      timeoutMs,
      limit,
      oldest,
    });

    for (const message of messages) {
      if (!isReadableSlackMessage(message)) continue;
      const rootText = cleanSlackText(message.text);
      const rootMatchesProject = slackToneContextMatches(rootText, params.projectId);
      const rootMatchesSenior = slackAuthorMatches(message, seniorUserIds);

      if (rootMatchesSenior && rootMatchesProject) {
        pushSlackRecord({
          records,
          seen,
          channelId,
          message,
          request: params,
          threadTitle: `Slack ${channelId}`,
          text: rootText,
        });
      }

      if (!includeThreads || !message.reply_count || !message.ts || records.length >= maxRecords) {
        continue;
      }

      const replies = await fetchSlackMessages({
        token,
        channelId,
        method: "conversations.replies",
        timeoutMs,
        limit: threadLimit,
        oldest,
        ts: message.ts,
      });

      const threadMatchesProject =
        rootMatchesProject ||
        replies.some((reply) => slackToneContextMatches(cleanSlackText(reply.text), params.projectId));

      for (const reply of replies) {
        if (reply.ts === message.ts || !isReadableSlackMessage(reply)) continue;
        if (!slackAuthorMatches(reply, seniorUserIds)) continue;

        const replyText = cleanSlackText(reply.text);
        if (!threadMatchesProject && !slackToneContextMatches(replyText, params.projectId)) continue;

        pushSlackRecord({
          records,
          seen,
          channelId,
          message: reply,
          request: params,
          threadTitle: `Slack ${channelId} thread ${message.ts}`,
          text: rootText ? `主題：${rootText}\n回覆：${replyText}` : replyText,
        });
        if (records.length >= maxRecords) break;
      }

      if (records.length >= maxRecords) break;
    }

    if (records.length >= maxRecords) break;
  }

  return {
    records: records.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    usedLive: true,
  };
}

function notionHeaders(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "notion-version": process.env.NOTION_VERSION ?? "2022-06-28",
  };
}

function richTextToPlainText(richText: NotionRichText[] | undefined) {
  return (richText ?? [])
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
}

function blockToPlainText(block: NotionBlock) {
  if (block.type === "table_row") {
    return (block.table_row?.cells ?? [])
      .map((cell) => richTextToPlainText(cell))
      .filter(Boolean)
      .join(" | ");
  }

  if (block.type === "child_page") return block.child_page?.title ? `子頁面：${block.child_page.title}` : "";

  const richTextBlock = block[block.type as keyof NotionBlock] as
    | { rich_text?: NotionRichText[]; checked?: boolean }
    | undefined;
  const text = richTextToPlainText(richTextBlock?.rich_text);
  if (!text) return "";
  if (block.type === "heading_1") return `# ${text}`;
  if (block.type === "heading_2") return `## ${text}`;
  if (block.type === "heading_3") return `### ${text}`;
  if (block.type === "to_do") return `${richTextBlock?.checked ? "[x]" : "[ ]"} ${text}`;
  return text;
}

function pageTitle(page: NotionPage) {
  const properties = page.properties ?? {};
  for (const property of Object.values(properties)) {
    if (!property || typeof property !== "object") continue;
    const value = property as { type?: string; title?: NotionRichText[] };
    if (value.type === "title") {
      const title = richTextToPlainText(value.title);
      if (title) return title;
    }
  }
  return "未命名 Notion 交接頁";
}

async function fetchNotionPageIdsFromDatabase(apiKey: string, timeoutMs: number) {
  const databaseId = process.env.NOTION_DATABASE_ID
    ? normalizeNotionId(process.env.NOTION_DATABASE_ID)
    : "";
  if (!databaseId) return [];

  const body = await fetchJson<{ results?: NotionPage[] }>(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method: "POST",
      headers: notionHeaders(apiKey),
      body: JSON.stringify({ page_size: numberFromEnv("NOTION_DATABASE_PAGE_SIZE", 20) }),
    },
    timeoutMs,
  );

  return (body?.results ?? []).map((page) => page.id).filter(Boolean);
}

async function fetchNotionBlocks(apiKey: string, blockId: string, timeoutMs: number, depth = 0) {
  const blockLimit = numberFromEnv("NOTION_FETCH_BLOCK_LIMIT", 100);
  const maxDepth = numberFromEnv("NOTION_FETCH_DEPTH", 3);
  const lines: string[] = [];
  let cursor = "";

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set("page_size", String(blockLimit));
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const body = await fetchJson<NotionBlocksResponse>(
      url.toString(),
      {
        headers: notionHeaders(apiKey),
      },
      timeoutMs,
    );
    const blocks = body?.results ?? [];

    for (const block of blocks) {
      const text = blockToPlainText(block);
      if (text) lines.push(text);
      if (block.has_children && depth < maxDepth) {
        lines.push(...(await fetchNotionBlocks(apiKey, block.id, timeoutMs, depth + 1)));
      }
    }

    cursor = body?.next_cursor ?? "";
    if (!body?.has_more) break;
  } while (cursor);

  return lines;
}

function chunkNotionLines(lines: string[], maxChars = 900) {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    if (currentLength + line.length > maxChars && current.length) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

function buildNotionToneChunks(lines: string[]) {
  const recordMaxChars = numberFromEnv("NOTION_TONE_RECORD_MAX_CHARS", 700);
  const toneSectionPattern = new RegExp(
    splitEnvList(process.env.NOTION_TONE_SECTION_NAMES ?? "討論,語氣樣本,Slack 摘要,對話紀錄")
      .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "i",
  );
  const toneLines: string[] = [];
  let insideToneSection = false;

  for (const line of lines) {
    const isHeading = /^#{1,3}\s+/.test(line);
    if (isHeading) insideToneSection = toneSectionPattern.test(line);
    if (insideToneSection || toneSectionPattern.test(line)) toneLines.push(line);
  }

  return chunkNotionLines(toneLines.length ? toneLines : lines, recordMaxChars);
}

async function fetchNotionContext(params: WorkspaceContextParams): Promise<{
  records: CommunicationRecord[];
  handoffSources: Source[];
  usedLive: boolean;
}> {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) return { records: [], handoffSources: [], usedLive: false };

  const timeoutMs = numberFromEnv("CONNECTOR_TIMEOUT_MS", 8000);
  const handoffPageIds = splitEnvList(process.env.NOTION_PAGE_IDS).map(normalizeNotionId);
  const databasePageIds = await fetchNotionPageIdsFromDatabase(apiKey, timeoutMs);
  const tonePageIds = splitEnvList(process.env.NOTION_TONE_PAGE_IDS).map(normalizeNotionId);
  const handoffPageIdSet = new Set([...handoffPageIds, ...databasePageIds]);
  const tonePageIdSet = new Set(tonePageIds);
  const usesExplicitTonePages = tonePageIdSet.size > 0;
  const pageIds = Array.from(
    new Set([...handoffPageIds, ...databasePageIds, ...tonePageIds].filter(Boolean)),
  );
  if (!pageIds.length) {
    return { records: [], handoffSources: [], usedLive: Boolean(pageIds.length) };
  }

  const records: CommunicationRecord[] = [];
  const handoffSources: Source[] = [];

  for (const pageId of pageIds) {
    const page = await fetchJson<NotionPage>(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        headers: notionHeaders(apiKey),
      },
      timeoutMs,
    );
    if (!page) continue;

    const title = pageTitle(page);
    const lines = await fetchNotionBlocks(apiKey, pageId, timeoutMs);
    const filteredLines = lines.filter((line) => projectMatches(`${title}\n${line}`, params.projectId));
    const usefulLines = filteredLines.length ? filteredLines : lines;
    if (!usefulLines.length) continue;

    const timestamp = page.last_edited_time ?? page.created_time ?? new Date().toISOString();
    if (handoffPageIdSet.has(pageId)) {
      const chunks = chunkNotionLines(usefulLines);
      chunks.forEach((chunk, index) => {
        handoffSources.push({
          title: `Notion：${title}${chunks.length > 1 ? ` #${index + 1}` : ""}`,
          detail: chunk,
          owner: process.env.NOTION_OWNER_NAME ?? "Notion",
          date: timestamp.slice(0, 10),
        });
      });
    }

    const shouldUseAsTone = usesExplicitTonePages ? tonePageIdSet.has(pageId) : handoffPageIdSet.has(pageId);
    if (params.seniorId !== "default" && shouldUseAsTone) {
      const maxToneRecords = numberFromEnv("NOTION_TONE_RECORD_LIMIT", 8);
      buildNotionToneChunks(usefulLines)
        .slice(0, maxToneRecords)
        .forEach((chunk, index) => {
          records.push({
            id: `notion-${page.id}-${index + 1}`,
            source: "notion",
            authorId: params.seniorId,
            authorName: process.env.NOTION_TONE_AUTHOR_NAME ?? process.env.NOTION_OWNER_NAME ?? "前同事",
            projectId: params.projectId,
            threadTitle: `${title}${index ? ` #${index + 1}` : ""}`,
            timestamp,
            permissionScope: "team",
            text: truncateText(chunk),
          });
        });
    }
  }

  return {
    records: records.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    handoffSources,
    usedLive: true,
  };
}

function dedupeRecords(records: CommunicationRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.source}:${record.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackMockRecords(params: WorkspaceContextParams) {
  if (params.seniorId === "default") return [];
  return mockCommunicationRecords.filter(
    (record) => record.projectId === params.projectId && record.authorId === params.seniorId,
  );
}

export async function fetchWorkspaceContext(params: WorkspaceContextParams): Promise<WorkspaceContext> {
  const forceMock = process.env.WORKSPACE_CONNECTORS === "mock";
  const [slack, notion] = forceMock
    ? [
        { records: [], usedLive: false },
        { records: [], handoffSources: [], usedLive: false },
      ]
    : await Promise.all([fetchSlackRecords(params), fetchNotionContext(params)]);
  const liveRecords = dedupeRecords([...slack.records, ...notion.records]);
  const records = liveRecords.length ? liveRecords : fallbackMockRecords(params);
  const notionRecordCount = records.filter((record) => record.source === "notion").length;
  const slackRecordCount = records.filter((record) => record.source === "slack").length;

  return {
    records,
    handoffSources: notion.handoffSources,
    statuses: [
      {
        name: "notion",
        status: notionRecordCount || notion.handoffSources.length ? "ready" : "empty",
        records: notionRecordCount + notion.handoffSources.length,
        note:
          notion.handoffSources.length > 0
            ? "已讀取 Notion 交接頁，並像 Demo 文件一樣納入回答來源。"
            : notion.usedLive
              ? "Notion 已設定，但沒有找到可用交接內容；語氣改用可用紀錄或 mock。"
              : notionRecordCount > 0
                ? "目前使用 Notion mock 交接筆記做語氣分析。"
                : "尚未設定 Notion，交接文件先使用內建 Demo 資料。",
      },
      {
        name: "slack",
        status: slackRecordCount > 0 ? "ready" : "empty",
        records: slackRecordCount,
        note:
          slack.records.length > 0
            ? "已讀取 Slack 對話紀錄與 thread replies，並納入前同事語氣分析。"
            : slack.usedLive
              ? "Slack 已設定，但沒有找到符合專案與前同事條件的訊息。"
              : slackRecordCount > 0
                ? "目前使用 Slack mock 討論串做語氣分析。"
                : "尚未設定 Slack，語氣先使用預設交接風格。",
      },
    ],
  };
}
