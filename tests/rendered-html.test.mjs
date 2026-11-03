import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker(tag) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(tag, `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function render(pathname = "/", init = {}) {
  const worker = await loadWorker("test");

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
      redirect: "manual",
      ...init,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the FM01 entry flow", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-Hant">/i);
  assert.match(html, /無痛交接/);
  assert.match(html, /FLOWLINK/);
  assert.match(html, /選擇使用身分/);
  assert.match(html, /今天想從哪裡開始/);
  assert.match(html, /登入後系統會再驗證帳號權限/);
  assert.match(html, /交接不斷線/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("includes the supervisor role in the identity flow", async () => {
  const source = await readFile(
    new URL("../app/FM01.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /id: "supervisor"/);
  assert.match(source, /title: "我是主管"/);
  assert.match(source, /destination: "交接管理總覽"/);
});

test("sends every role to an existing portal after login", async () => {
  const auth = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /`\/onboarding\?caseId=\$\{encodedCaseId\}`/);
  assert.match(auth, /path: "\/supervisor\/create"/);
  assert.equal(auth.match(/path: "\/handoff\/upload"/g)?.length, 2);
  assert.doesNotMatch(auth, /path: null/);
});

test("server-renders the new hire module guide", async () => {
  const response = await render("/onboarding");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /現在想從哪裡開始/);
  assert.match(html, /企劃地圖/);
  assert.match(html, /新人上手路線圖/);
  assert.match(html, /風險知識管理/);
  assert.match(html, /和無痛交接小幫手聊聊/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("keeps the existing project map available from its module route", async () => {
  const response = await render("/onboarding/project-map");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /交接知識心智圖/);
  assert.match(html, /選擇整個資料夾/);
  assert.match(html, /最多 50 份/);
  assert.match(html, /四類知識地圖/);
});

const portals = {
  newcomer: {
    labels: ["現有資料", "企劃地圖", "新人上手路線圖", "風險知識管理"],
    routes: [
      "/onboarding",
      "/onboarding/project-map",
      "/onboarding/roadmap",
      "/onboarding/risk-knowledge",
      "/onboarding/chat",
    ],
  },
  supervisor: {
    labels: ["建立交接專案", "審核交接文件", "指派接手新人", "對話審查", "RAG 知識庫管理"],
    routes: [
      "/supervisor/create",
      "/supervisor/review",
      "/supervisor/assign",
      "/supervisor/conversations",
    ],
  },
  handoff: {
    labels: ["交接資料與經驗訪談"],
    routes: ["/handoff/upload"],
  },
};

for (const [portal, { labels, routes }] of Object.entries(portals)) {
  for (const route of routes) {
    test(`${portal} portal renders ${route} with its shared navigation`, async () => {
      const response = await render(route);
      assert.equal(response.status, 200, `${route} should render`);
      const html = await response.text();
      assert.match(html, /class="sidebar site-nav-sidebar"/);
      for (const label of labels) assert.match(html, new RegExp(label), `${route} nav shows ${label}`);
      assert.match(html, /切換身分/);
    });
  }
}

test("embeds the standalone supervisor and handoff modules", async () => {
  for (const [route, file] of [
    ["/supervisor/create", "handoff-project-create-ui.html"],
    ["/supervisor/review", "supervisor-review-ui.html"],
    ["/supervisor/assign", "newcomer-assignment-ui.html"],
    ["/handoff/upload", "handoff-upload-ui.html"],
  ]) {
    const html = await (await render(route)).text();
    assert.match(html, new RegExp(`src="/legacy/${file}"`));
    await readFile(new URL(`../public/legacy/${file}`, import.meta.url));
  }
});

test("redirects former rag-service paths and portal roots", async () => {
  for (const [source, destination] of [
    ["/project-map", "/onboarding/project-map"],
    ["/onboarding-roadmap", "/onboarding/roadmap"],
    ["/risk-management", "/onboarding/risk-knowledge"],
    ["/assistant", "/onboarding/chat"],
    ["/chat", "/onboarding/chat"],
    ["/admin/conversations", "/supervisor/conversations"],
    ["/supervisor", "/supervisor/create"],
    ["/handoff", "/handoff/upload"],
  ]) {
    const response = await render(source);
    assert.ok([302, 307, 308].includes(response.status), `${source} -> ${response.status}`);
    assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, destination);
  }
});

test("keeps the four-category contract and runtime upload controls", async () => {
  const [page, layout, sidebar, packageJson] = await Promise.all([
    readFile(new URL("../frontend/pages/InsightShiftPages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/site-sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const label of ["專案任務現況", "決策脈絡與核心概念", "人員配置", "討論歷史（風險與錯誤）"]) {
    assert.match(page, new RegExp(label.replace(/[（）]/g, ".")));
  }
  assert.match(page, /\/api\/analyze/);
  assert.match(page, /webkitdirectory/);
  assert.match(page, /relativePaths/);
  assert.match(page, /href: "\/onboarding\/project-map"/);
  assert.match(page, /href: "\/onboarding\/roadmap"/);
  assert.match(page, /href: "\/onboarding\/risk-knowledge"/);
  assert.match(page, /href=\{ASSISTANT_HREF\}/);
  assert.match(page, /OPENAI_API_KEY/);
  assert.match(page, /不評分，也不檢查缺漏/);
  assert.match(page, /handoff-sidebar-collapsed/);
  assert.match(page, /handoff-agent-panel-collapsed/);
  assert.match(sidebar, /收合左側欄/);
  assert.match(page, /收合右側 Agent 面板/);
  assert.match(layout, /lang="zh-Hant"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("accepts a variable-size DOCX batch before requesting an API key", async () => {
  const worker = await loadWorker("docx-test");
  const name = "01_業務內容交接_Project_ORBIT.docx";
  const formData = new FormData();
  const bytes = await readFile(new URL(`../data/無痛交接Demo資料_v1/${name}`, import.meta.url));
  formData.append(
    "files",
    new File([bytes], name, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );

  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze", { method: "POST", body: formData }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 503);
    assert.match(await response.text(), /OPENAI_API_KEY/);
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  }
});
