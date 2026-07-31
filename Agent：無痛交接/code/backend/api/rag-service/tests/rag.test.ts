import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ParsedDocument } from "../lib/mindmap";
import { chunkDocument } from "../lib/rag/chunker";
import {
  DOCX_MIME_TYPE,
  type EmbeddingProvider,
  type IndexedDocument,
  type KnowledgeChunk,
  type KnowledgeSource,
  type RetrievalHit,
  type SourceDocument,
  type VectorQuery,
  type VectorStore,
} from "../lib/rag/contracts";
import { calculateDocumentDiff } from "../lib/rag/diff";
import { sha256 } from "../lib/rag/digest";
import { cosineSimilarity, MemoryEmbeddingVectorStore } from "../lib/rag/embedding-memory";
import { DeterministicHashEmbeddingProvider } from "../lib/rag/embeddings/deterministic";
import {
  createOpenAIEmbeddingProviderFromEnvironment,
  OpenAIEmbeddingProvider,
  resolveEmbeddingsEndpoint,
} from "../lib/rag/embeddings/openai";
import { evaluateRetrieval } from "../lib/rag/evaluation";
import { ORBIT_GOLDEN_QUESTIONS } from "../lib/rag/golden-questions";
import {
  DualCandidateRetriever,
  fixedQueryProfile,
  fuseCandidates,
  HybridVectorStore,
  profileQuery,
  profileQueryEvidence,
  type CandidateSet,
} from "../lib/rag/hybrid";
import { IndexingService } from "../lib/rag/indexing";
import { MemoryDocumentRepository, MemoryLexicalVectorStore } from "../lib/rag/memory";
import { RetrievalService } from "../lib/rag/retrieval";
import { LocalFolderKnowledgeSource, LocalFolderSourceError } from "../lib/rag/sources/local-folder";
import { POST as queryPost } from "../app/api/assistant/query/route";
import { POST as syncPost } from "../app/api/knowledge/sync/route";
import {
  DELETE as documentDelete,
  GET as documentsGet,
  POST as documentPost,
} from "../app/api/knowledge/documents/route";
import { GET as adminOverviewGet } from "../app/api/admin/rag/overview/route";

const demoDirectory = new URL("../../data/無痛交接Demo資料_v1/", import.meta.url);
const firstDemo = new URL("01_業務內容交接_Project_ORBIT.docx", demoDirectory);
const secondDemo = new URL("02_人際關係交接_Project_ORBIT.docx", demoDirectory);

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function sourceDocument(
  projectId: string,
  documentId: string,
  relativePath: string,
  bytes: Buffer,
): Promise<SourceDocument> {
  return {
    projectId,
    documentId,
    relativePath,
    fileName: basename(relativePath),
    mimeType: DOCX_MIME_TYPE,
    size: bytes.byteLength,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    checksum: await sha256(bytes),
    readContent: async () => bufferToArrayBuffer(bytes),
  };
}

class MutableSource implements KnowledgeSource {
  readonly sourceKey = "test-source:root";
  documents: SourceDocument[] = [];
  async listDocuments(projectId: string): Promise<SourceDocument[]> {
    return this.documents.filter((document) => document.projectId === projectId);
  }
}

class CountingVectorStore extends MemoryLexicalVectorStore {
  replacements = 0;
  override async replaceDocumentChunks(...args: Parameters<MemoryLexicalVectorStore["replaceDocumentChunks"]>) {
    this.replacements += 1;
    await super.replaceDocumentChunks(...args);
  }
}

class FixtureEmbeddingProvider implements EmbeddingProvider {
  readonly model = "fixture-semantic-v1";

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.vector(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.vector(text);
  }

  private vector(text: string): number[] {
    const normalized = text.toLocaleLowerCase();
    const dimensions = [
      /工程|開發|developer/.test(normalized) ? 1 : 0,
      /負責|窗口|誰/.test(normalized) ? 1 : 0,
      /設備|資產|手機|筆電/.test(normalized) ? 1 : 0,
      /日期|時間|上線|何時/.test(normalized) ? 1 : 0,
    ];
    return dimensions.some(Boolean) ? dimensions : [0.1, 0.1, 0.1, 0.1];
  }
}

class FixedResultStore implements VectorStore {
  readonly strategy: string;

  constructor(strategy: string, private readonly hits: RetrievalHit[]) {
    this.strategy = strategy;
  }

  async replaceDocumentChunks(): Promise<void> {}
  async deleteDocument(): Promise<void> {}
  async query(request: VectorQuery): Promise<RetrievalHit[]> {
    return this.hits
      .filter((hit) => hit.metadata.projectId === request.projectId)
      .slice(0, request.topK)
      .map((hit) => structuredClone(hit));
  }
}

function fixtureHit(id: string, score: number, projectId = "hybrid-project"): RetrievalHit {
  return {
    id,
    score,
    text: `Evidence ${id}`,
    metadata: {
      projectId,
      documentId: `doc-${id}`,
      relativePath: `${id}.docx`,
      fileName: `${id}.docx`,
      locator: "paragraph 1",
      locators: ["paragraph 1"],
      chunkIndex: 0,
      kind: "paragraph",
    },
  };
}

test("local folder source blocks traversal and exposes only supported relative files", async () => {
  assert.throws(
    () => new LocalFolderKnowledgeSource("C:\\allowed", "../outside"),
    (error: unknown) => error instanceof LocalFolderSourceError && error.code === "INVALID_SCOPE",
  );
  assert.throws(() => new LocalFolderKnowledgeSource("C:\\allowed", "C:\\Windows"), LocalFolderSourceError);

  const root = await mkdtemp(join(tmpdir(), "rag-source-"));
  await mkdir(join(root, "nested"));
  await copyFile(firstDemo, join(root, "nested", "allowed.docx"));
  await writeFile(join(root, "ignored.txt"), "untrusted text");
  const source = new LocalFolderKnowledgeSource(root);
  const documents = await source.listDocuments("project-safe");

  assert.equal(documents.length, 1);
  assert.equal(documents[0].relativePath, "nested/allowed.docx");
  assert.equal(documents[0].fileName, "allowed.docx");
  assert.equal(documents[0].mimeType, DOCX_MIME_TYPE);
  assert.ok(!documents[0].relativePath.includes(root));
  assert.equal((await source.listDocuments("project-safe"))[0].documentId, documents[0].documentId);
});

test("diff classifies added, updated, unchanged, and deleted by stable id and checksum", async () => {
  const bytes = await readFile(firstDemo);
  const current = [
    await sourceDocument("p", "added", "added.docx", bytes),
    await sourceDocument("p", "updated", "updated.docx", bytes),
    await sourceDocument("p", "same", "same.docx", bytes),
  ];
  const indexed = (id: string, checksum: string): IndexedDocument => ({
    documentId: id, projectId: "p", sourceKey: "s", relativePath: `${id}.docx`,
    fileName: `${id}.docx`, mimeType: DOCX_MIME_TYPE, size: 1,
    modifiedAt: "2025-01-01T00:00:00.000Z", checksum, indexedAt: "2025-01-01T00:00:00.000Z",
    chunkCount: 1,
  });
  const result = calculateDocumentDiff(current, [
    indexed("updated", "old"),
    indexed("same", current[2].checksum),
    indexed("deleted", "gone"),
  ]);
  assert.deepEqual(result.added.map((item) => item.documentId), ["added"]);
  assert.deepEqual(result.updated.map((item) => item.documentId), ["updated"]);
  assert.deepEqual(result.unchanged.map((item) => item.documentId), ["same"]);
  assert.deepEqual(result.deleted.map((item) => item.documentId), ["deleted"]);
});

test("chunking retains traceable project, document, file, locator, and index metadata", async () => {
  const bytes = Buffer.from("placeholder");
  const source = await sourceDocument("project-meta", "doc-meta", "folder/source.docx", bytes);
  const parsed: ParsedDocument = {
    fileName: source.fileName,
    paragraphCount: 2,
    tableCount: 0,
    blocks: [
      { id: "a", fileName: source.fileName, locator: "段落 1", kind: "paragraph", text: "Alpha project owner and deadline." },
      { id: "b", fileName: source.fileName, locator: "段落 2", kind: "paragraph", text: "Beta risk and mitigation." },
    ],
  };
  const chunks = chunkDocument(source, parsed, { maxCharacters: 100, overlapCharacters: 20 });
  assert.ok(chunks.length >= 1);
  assert.deepEqual(chunks[0].metadata, {
    projectId: "project-meta",
    documentId: "doc-meta",
    relativePath: "folder/source.docx",
    fileName: "source.docx",
    locator: "段落 1 – 段落 2",
    locators: ["段落 1", "段落 2"],
    chunkIndex: 0,
    kind: "paragraph",
  });
});

test("indexing skips unchanged checksums, replaces updates, and cleans deleted chunks", async () => {
  const repository = new MemoryDocumentRepository();
  const vectors = new CountingVectorStore();
  const indexing = new IndexingService(repository, vectors);
  const source = new MutableSource();
  const first = await sourceDocument("project-index", "stable-doc", "handoff.docx", await readFile(firstDemo));
  source.documents = [first];

  const initial = await indexing.sync("project-index", source);
  assert.equal(initial.added, 1);
  assert.equal(initial.failures.length, 0);
  assert.ok(vectors.getChunks("project-index").length > 0);
  assert.equal(vectors.replacements, 1);

  const unchanged = await indexing.sync("project-index", source);
  assert.equal(unchanged.unchanged, 1);
  assert.equal(unchanged.indexedChunks, 0);
  assert.equal(vectors.replacements, 1);

  source.documents = [await sourceDocument("project-index", "stable-doc", "handoff.docx", await readFile(secondDemo))];
  const updated = await indexing.sync("project-index", source);
  assert.equal(updated.updated, 1);
  assert.equal(updated.failures.length, 0);
  assert.equal(vectors.replacements, 2);
  assert.ok(vectors.getChunks("project-index").every((chunk) => chunk.metadata.documentId === "stable-doc"));

  source.documents = [];
  const deleted = await indexing.sync("project-index", source);
  assert.equal(deleted.deleted, 1);
  assert.equal(vectors.getChunks("project-index").length, 0);
});

test("retrieval enforces project isolation", async () => {
  const vectors = new MemoryLexicalVectorStore();
  const chunk = (projectId: string, id: string, text: string) => ({
    id,
    text,
    metadata: {
      projectId, documentId: `doc-${id}`, relativePath: `${id}.docx`, fileName: `${id}.docx`,
      locator: "段落 1", locators: ["段落 1"], chunkIndex: 0, kind: "paragraph",
    },
  });
  await vectors.replaceDocumentChunks("project-a", "doc-a", [chunk("project-a", "a", "secret orbit deadline")]);
  await vectors.replaceDocumentChunks("project-b", "doc-b", [chunk("project-b", "b", "secret orbit deadline")]);
  const hits = (await new RetrievalService(vectors).retrieve("project-a", "orbit deadline", 10)).hits;
  assert.deepEqual(hits.map((hit) => hit.metadata.projectId), ["project-a"]);
});

test("OpenAI embedding provider batches requests and restores response index order", async () => {
  const requests: Array<{ url: string; authorization: string | null; body: Record<string, unknown> }> = [];
  const provider = new OpenAIEmbeddingProvider({
    apiKey: "test-key",
    baseUrl: "https://api.example.test/v1/",
    model: "embedding-test-model",
    dimensions: 3,
    batchSize: 2,
    fetchImpl: (async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return Response.json({
        object: "list",
        model: "embedding-test-model",
        data: body.input.map((_, index) => ({
          object: "embedding",
          index,
          embedding: [index + 1, body.input.length, 0.5],
        })).reverse(),
      });
    }) as typeof fetch,
  });

  const vectors = await provider.embedDocuments(["first", "second", "third"]);
  assert.deepEqual(vectors, [[1, 2, 0.5], [2, 2, 0.5], [1, 1, 0.5]]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://api.example.test/v1/embeddings");
  assert.equal(requests[0].authorization, "Bearer test-key");
  assert.deepEqual(requests[0].body, {
    model: "embedding-test-model",
    input: ["first", "second"],
    encoding_format: "float",
    dimensions: 3,
  });
  assert.equal(resolveEmbeddingsEndpoint("https://api.example.test/v1"),
    "https://api.example.test/v1/embeddings");
});

test("RAG embedding environment is isolated from the project-map LLM credentials", () => {
  const names = [
    "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL",
    "RAG_EMBEDDING_API_KEY", "RAG_EMBEDDING_BASE_URL", "RAG_EMBEDDING_MODEL",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.OPENAI_API_KEY = "map-key";
    process.env.OPENAI_BASE_URL = "https://map.example.test/v1";
    process.env.OPENAI_MODEL = "map-model";
    process.env.RAG_EMBEDDING_API_KEY = "rag-key";
    process.env.RAG_EMBEDDING_BASE_URL = "https://rag.example.test/v1";
    process.env.RAG_EMBEDDING_MODEL = "rag-model";
    const provider = createOpenAIEmbeddingProviderFromEnvironment();
    assert.equal(provider.model, "rag-model");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("memory cosine vector search ranks semantic vectors and isolates projects", async () => {
  const vectors = new MemoryEmbeddingVectorStore(new FixtureEmbeddingProvider());
  const chunk = (projectId: string, documentId: string, id: string, text: string): KnowledgeChunk => ({
    id,
    text,
    metadata: {
      projectId, documentId, relativePath: `${id}.docx`, fileName: `${id}.docx`,
      locator: "段落 1", locators: ["段落 1"], chunkIndex: 0, kind: "paragraph",
    },
  });
  await vectors.replaceDocumentChunks("project-a", "doc-a", [
    chunk("project-a", "doc-a", "engineering", "陳柏維負責系統開發與缺陷修正"),
    chunk("project-a", "doc-a", "device", "測試用手機放在 QA 設備櫃"),
  ]);
  await vectors.replaceDocumentChunks("project-b", "doc-b", [
    chunk("project-b", "doc-b", "other", "另一個專案的工程負責窗口"),
  ]);

  const hits = await vectors.query({ projectId: "project-a", text: "系統開發要找誰？", topK: 2 });
  assert.equal(hits[0].id, "engineering");
  assert.ok(hits.every((hit) => hit.metadata.projectId === "project-a"));
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("offline hash embeddings are deterministic and explicitly marked as mock", async () => {
  const provider = new DeterministicHashEmbeddingProvider(64);
  const first = await provider.embedQuery("ORBIT BI-042");
  const second = await provider.embedQuery("ORBIT BI-042");
  assert.deepEqual(first, second);
  assert.equal(first.length, 64);
  assert.match(provider.model, /mock/);
  assert.ok(Math.abs(cosineSimilarity(first, second) - 1) < 1e-12);
});

test("layer 1 runs both retrievers and unions candidates without mixing raw scores", async () => {
  const lexical = new FixedResultStore("lexical", [fixtureHit("shared", 0.9), fixtureHit("lexical", 0.8)]);
  const vector = new FixedResultStore("vector", [fixtureHit("vector", 0.99), fixtureHit("shared", 0.1)]);
  const result = await new DualCandidateRetriever(lexical, vector).retrieve({
    projectId: "hybrid-project",
    text: "question",
    topK: 20,
  });

  assert.equal(result.candidates.length, 3);
  const shared = result.candidates.find((candidate) => candidate.chunk.id === "shared");
  assert.deepEqual(shared?.lexical, { rank: 1, score: 0.9 });
  assert.deepEqual(shared?.vector, { rank: 2, score: 0.1 });
  assert.ok(result.latency.totalMs >= result.latency.mergeMs);
});

test("layer 2 fixed RRF uses ranks and records each retriever contribution", () => {
  const candidates: CandidateSet = {
    candidateK: 20,
    lexicalHits: [],
    vectorHits: [],
    candidates: [
      { chunk: fixtureHit("both", 0), lexical: { rank: 2, score: 99 }, vector: { rank: 1, score: -3 } },
      { chunk: fixtureHit("lexical-only", 0), lexical: { rank: 1, score: 0.01 } },
    ],
    latency: { lexicalMs: 1, vectorMs: 2, wallMs: 2, mergeMs: 0.1, totalMs: 2.1 },
  };
  const fusion = fuseCandidates(candidates, fixedQueryProfile(), 10, "fixed");

  assert.equal(fusion.results[0].id, "both");
  assert.equal(fusion.results[0].lexicalContribution, Number((0.5 / 12).toFixed(12)));
  assert.equal(fusion.results[0].vectorContribution, Number((0.5 / 11).toFixed(12)));
  assert.equal(fusion.results[0].queryType, "mixed");
  assert.deepEqual([fusion.results[0].lexicalWeight, fusion.results[0].vectorWeight], [0.5, 0.5]);
  assert.equal(fusion.results[0].rrfK, 10);
  assert.deepEqual(fusion.results[0].retrievedBy, ["lexical", "vector"]);
});

test("layer 3 profiles exact, semantic, and mixed questions with bounded weights", () => {
  const exact = profileQuery("ORBIT 的 BI-042 在哪個資料夾？");
  const semantic = profileQuery("為什麼上線會有風險，應該怎麼處理？");
  const mixed = profileQuery("為什麼 ORBIT 的 BI-042 會卡住？");

  assert.deepEqual([exact.type, exact.lexicalWeight, exact.vectorWeight, exact.focusWeight], ["exact", 0.7, 0.3, 0]);
  assert.deepEqual([semantic.type, semantic.lexicalWeight, semantic.vectorWeight, semantic.focusWeight], ["semantic", 0.3, 0.7, 0]);
  assert.deepEqual([mixed.type, mixed.lexicalWeight, mixed.vectorWeight, mixed.focusWeight], ["mixed", 0.45, 0.55, 0]);
  for (const profile of [exact, semantic, mixed]) {
    assert.equal(profile.lexicalWeight + profile.vectorWeight + profile.focusWeight, 1);
    assert.ok(profile.reasons.length > 0);
  }
});

test("evidence focus signal promotes a locally relevant row without mixing raw scores", async () => {
  const lexical = new FixedResultStore("lexical", [
    { ...fixtureHit("diluted", 0.9), text: "一般離職流程\n設備都有歸還方式\n其他說明" },
    { ...fixtureHit("focused", 0.8), text: "公司筆電 NB-TW-2841｜離職日交由 IT 回收" },
  ]);
  const vector = new FixedResultStore("vector", [
    { ...fixtureHit("diluted", 0.9), text: "一般離職流程\n設備都有歸還方式\n其他說明" },
    { ...fixtureHit("focused", 0.8), text: "公司筆電 NB-TW-2841｜離職日交由 IT 回收" },
  ]);
  const candidates = await new DualCandidateRetriever(lexical, vector).retrieve({
    projectId: "hybrid-project", text: "公司的筆電在離職時如何歸還？", topK: 20,
  });
  const focused = candidates.candidates.find((candidate) => candidate.chunk.id === "focused");
  assert.equal(focused?.focus?.rank, 1);
  const fusion = fuseCandidates(candidates, profileQueryEvidence("公司的筆電在離職時如何歸還？"), 10, "adaptive");
  assert.equal(fusion.results[0].id, "focused");
  assert.ok(fusion.results[0].focusContribution > 0);
});

test("hybrid store indexes, retrieves, isolates projects, and deletes both backends", async () => {
  const lexical = new MemoryLexicalVectorStore();
  const vector = new MemoryEmbeddingVectorStore(new FixtureEmbeddingProvider());
  const hybrid = new HybridVectorStore(lexical, vector, { candidateK: 5, rrfK: 10 });
  const chunk = (projectId: string, id: string): KnowledgeChunk => ({
    ...fixtureHit(id, 0, projectId),
    metadata: { ...fixtureHit(id, 0, projectId).metadata, documentId: `doc-${projectId}` },
  });
  await hybrid.replaceDocumentChunks("project-a", "doc-project-a", [chunk("project-a", "engineering")]);
  await hybrid.replaceDocumentChunks("project-b", "doc-project-b", [chunk("project-b", "engineering-other")]);

  const hits = await hybrid.query({ projectId: "project-a", text: "developer owner", topK: 5 });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.metadata.projectId === "project-a"));
  await hybrid.deleteDocument("project-a", "doc-project-a");
  assert.equal((await hybrid.query({ projectId: "project-a", text: "developer owner", topK: 5 })).length, 0);
  assert.equal(lexical.getChunks("project-a").length, 0);
  assert.equal(vector.getChunks("project-a").length, 0);
});

test("golden evaluation reports Hit@K and MRR for the development baseline", async () => {
  assert.equal(ORBIT_GOLDEN_QUESTIONS.length, 30);
  const vectors = new MemoryLexicalVectorStore();
  const expected = ORBIT_GOLDEN_QUESTIONS[0];
  await vectors.replaceDocumentChunks("eval-project", "eval-doc", [{
    id: "expected",
    text: `${expected.question} 內容：${expected.expectedTextIncludes}`,
    metadata: {
      projectId: "eval-project", documentId: "eval-doc", relativePath: "source.docx",
      fileName: `01_${expected.expectedFileNameIncludes}.docx`, locator: "表 1／第 1 列",
      locators: ["表 1／第 1 列"], chunkIndex: 0, kind: "table_row",
    },
  }]);
  const evaluation = await evaluateRetrieval(
    new RetrievalService(vectors),
    "eval-project",
    [expected],
    5,
  );
  assert.equal(evaluation.hitRateAtK, 1);
  assert.equal(evaluation.meanReciprocalRank, 1);
  assert.equal(evaluation.questions[0].rank, 1);
});

test("knowledge and assistant APIs reject invalid JSON contracts", async () => {
  const wrongType = await syncPost(new Request("http://local/api/knowledge/sync", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "p", source: { type: "remote-drive" } }),
  }));
  assert.equal(wrongType.status, 400);

  const traversal = await syncPost(new Request("http://local/api/knowledge/sync", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "p", source: { type: "local-folder", scope: "../secret" } }),
  }));
  assert.equal(traversal.status, 400);

  const missingQuestion = await queryPost(new Request("http://local/api/assistant/query", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "p", question: "", topK: 50 }),
  }));
  assert.equal(missingQuestion.status, 400);

  const noEvidence = await queryPost(new Request("http://local/api/assistant/query", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "empty-project", question: "Who owns this task?" }),
  }));
  assert.equal(noEvidence.status, 200);
  const body = await noEvidence.json() as { answerGenerated: boolean; evidence: unknown[] };
  assert.equal(body.answerGenerated, false);
  assert.deepEqual(body.evidence, []);
});

test("RAG service bearer token protects server-to-server APIs when configured", async () => {
  const previous = process.env.RAG_SERVICE_API_KEY;
  process.env.RAG_SERVICE_API_KEY = "test-rag-service-secret";
  try {
    const denied = await queryPost(new Request("http://local/api/assistant/query", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "auth-project", question: "test" }),
    }));
    assert.equal(denied.status, 401);
    const allowed = await queryPost(new Request("http://local/api/assistant/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-rag-service-secret",
      },
      body: JSON.stringify({ projectId: "auth-project", question: "test" }),
    }));
    assert.equal(allowed.status, 200);
  } finally {
    if (previous === undefined) delete process.env.RAG_SERVICE_API_KEY;
    else process.env.RAG_SERVICE_API_KEY = previous;
  }
});

test("document API uploads, lists, retrieves, and deletes a DOCX without exposing paths", async () => {
  const bytes = await readFile(firstDemo);
  const form = new FormData();
  form.set("projectId", "upload-project");
  form.set("relativePath", "handoff/orbit-business.docx");
  form.set("file", new File([bytes], "orbit-business.docx", { type: DOCX_MIME_TYPE }));
  const uploaded = await documentPost(new Request("http://local/api/knowledge/documents", {
    method: "POST", body: form,
  }));
  assert.equal(uploaded.status, 201);
  const uploadBody = await uploaded.json() as {
    documentId: string; durable: boolean; indexedChunks: number; relativePath: string;
  };
  assert.match(uploadBody.documentId, /^doc_[a-f0-9]{32}$/);
  assert.equal(uploadBody.durable, false);
  assert.ok(uploadBody.indexedChunks > 0);
  assert.equal(uploadBody.relativePath, "handoff/orbit-business.docx");

  const listed = await documentsGet(
    new Request("http://local/api/knowledge/documents?projectId=upload-project"),
  );
  assert.equal(listed.status, 200);
  const listText = await listed.text();
  assert.doesNotMatch(listText, /Agent：無痛交接|OneDrive/);
  const listBody = JSON.parse(listText) as { documents: Array<{ documentId: string }> };
  assert.deepEqual(listBody.documents.map((item) => item.documentId), [uploadBody.documentId]);

  const retrieved = await queryPost(new Request("http://local/api/assistant/query", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "upload-project", question: "Project ORBIT", topK: 3 }),
  }));
  assert.equal(retrieved.status, 200);
  const retrievedBody = await retrieved.json() as { evidence: unknown[] };
  assert.ok(retrievedBody.evidence.length > 0);

  const deleted = await documentDelete(new Request("http://local/api/knowledge/documents", {
    method: "DELETE", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "upload-project", documentId: uploadBody.documentId }),
  }));
  assert.equal(deleted.status, 200);
  const afterDelete = await documentsGet(
    new Request("http://local/api/knowledge/documents?projectId=upload-project"),
  );
  const afterBody = await afterDelete.json() as { documents: unknown[] };
  assert.deepEqual(afterBody.documents, []);
});

test("document API rejects unsafe uploaded paths", async () => {
  const bytes = await readFile(firstDemo);
  const form = new FormData();
  form.set("projectId", "upload-project");
  form.set("relativePath", "../secret.docx");
  form.set("file", new File([bytes], "secret.docx", { type: DOCX_MIME_TYPE }));
  const response = await documentPost(new Request("http://local/api/knowledge/documents", {
    method: "POST", body: form,
  }));
  assert.equal(response.status, 400);
});

test("knowledge sync and assistant query APIs form an evidence-only local chain", async () => {
  const previousRoot = process.env.KNOWLEDGE_LOCAL_ROOT;
  process.env.KNOWLEDGE_LOCAL_ROOT = fileURLToPath(demoDirectory);
  try {
    const syncResponse = await syncPost(new Request("http://local/api/knowledge/sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-api", source: { type: "local-folder", scope: "." } }),
    }));
    assert.equal(syncResponse.status, 200);
    const syncText = await syncResponse.text();
    assert.doesNotMatch(syncText, /Agent：無痛交接|KNOWLEDGE_LOCAL_ROOT/);
    const syncBody = JSON.parse(syncText) as { status: string; result: { added: number; failures: unknown[] } };
    assert.equal(syncBody.status, "completed");
    assert.equal(syncBody.result.added, 3);
    assert.deepEqual(syncBody.result.failures, []);

    const queryResponse = await queryPost(new Request("http://local/api/assistant/query", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-api", question: "Project ORBIT", topK: 3 }),
    }));
    assert.equal(queryResponse.status, 200);
    const queryBody = await queryResponse.json() as {
      answerGenerated: boolean;
      retrievalStrategy: string;
      evidence: Array<{ citation: { fileName: string; locator: string } }>;
    };
    assert.equal(queryBody.answerGenerated, false);
    assert.equal(queryBody.retrievalStrategy, "deterministic-lexical-v1");
    assert.ok(queryBody.evidence.length > 0);
    assert.ok(queryBody.evidence.every((item) => item.citation.fileName && item.citation.locator));

    const adminResponse = await adminOverviewGet(
      new Request("http://local/api/admin/rag/overview?projectId=project-api"),
    );
    assert.equal(adminResponse.status, 200);
    const adminText = await adminResponse.text();
    assert.doesNotMatch(adminText, /Agent：無痛交接|KNOWLEDGE_LOCAL_ROOT/);
    const adminBody = JSON.parse(adminText) as {
      admin: { localDevelopment: boolean };
      counts: { documents: number; chunks: number; retrievals: number };
      chunks: Array<{ fileName: string; locator: string; text: string }>;
    };
    assert.equal(adminBody.admin.localDevelopment, true);
    assert.equal(adminBody.counts.documents, 3);
    assert.ok(adminBody.counts.chunks > 0);
    assert.ok(adminBody.counts.retrievals > 0);
    assert.ok(adminBody.chunks.every((chunk) => chunk.fileName && chunk.locator && chunk.text));
  } finally {
    if (previousRoot === undefined) delete process.env.KNOWLEDGE_LOCAL_ROOT;
    else process.env.KNOWLEDGE_LOCAL_ROOT = previousRoot;
  }
});
