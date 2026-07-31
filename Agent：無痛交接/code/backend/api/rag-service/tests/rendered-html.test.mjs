import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the new hire module guide", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>無痛交接｜InsightShift<\/title>/i);
  assert.match(html, /現在想從哪裡開始/);
  assert.match(html, /企劃地圖/);
  assert.match(html, /新人上手路線圖/);
  assert.match(html, /風險知識管理/);
  assert.match(html, /和無痛交接小幫手聊聊/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("keeps the existing project map available from its module route", async () => {
  const response = await render("/project-map");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /交接知識心智圖/);
  assert.match(html, /選擇整個資料夾/);
  assert.match(html, /最多 50 份/);
  assert.match(html, /四類知識地圖/);
});

test("keeps the four-category contract and runtime upload controls", async () => {
  const [page, layout, sidebar, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /href: "\/project-map"/);
  assert.match(page, /href: "\/onboarding-roadmap"/);
  assert.match(page, /href: "\/risk-management"/);
  assert.match(page, /href="\/assistant"/);
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
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("docx-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const names = [
    "01_業務內容交接_Project_ORBIT.docx",
    "02_人際關係交接_Project_ORBIT.docx",
    "03_公司資產交接_Project_ORBIT.docx",
  ];
  const formData = new FormData();

  for (const name of names.slice(0, 1)) {
    const bytes = await readFile(new URL(`../../data/無痛交接Demo資料_v1/${name}`, import.meta.url));
    formData.append(
      "files",
      new File([bytes], name, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
  }

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
