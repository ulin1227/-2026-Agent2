import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
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
