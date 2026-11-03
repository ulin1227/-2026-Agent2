import { MAX_SOURCE_FILE_SIZE } from "../config";
import { DOCX_MIME_TYPE, type KnowledgeSource, type SourceDocument } from "../contracts";
import { sha256, stableDocumentId } from "../digest";

export class LocalFolderSourceError extends Error {
  readonly code: "INVALID_SCOPE" | "SOURCE_UNAVAILABLE";

  constructor(
    code: "INVALID_SCOPE" | "SOURCE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "LocalFolderSourceError";
    this.code = code;
  }
}

function normalizeScope(scope: string | undefined): string {
  if (!scope || scope === ".") return "";
  if (scope.includes("\0") || /^[a-zA-Z]:/.test(scope) || scope.startsWith("/") || scope.startsWith("\\")) {
    throw new LocalFolderSourceError("INVALID_SCOPE", "Source scope must be relative.");
  }
  const parts = scope.replace(/\\/g, "/").split("/").filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new LocalFolderSourceError("INVALID_SCOPE", "Source scope cannot traverse parent folders.");
  }
  return parts.join("/");
}

function assertContained(pathModule: typeof import("node:path"), root: string, candidate: string): void {
  const relative = pathModule.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${pathModule.sep}`) || pathModule.isAbsolute(relative)) {
    throw new LocalFolderSourceError("INVALID_SCOPE", "Resolved path is outside the allowed source root.");
  }
}

function getNodeModules(): {
  fs: typeof import("node:fs/promises");
  path: typeof import("node:path");
} {
  if (typeof process === "undefined" || typeof process.getBuiltinModule !== "function") {
    throw new LocalFolderSourceError(
      "SOURCE_UNAVAILABLE",
      "The local-folder source is available only in a Node.js development or test runtime.",
    );
  }
  return {
    fs: process.getBuiltinModule("node:fs/promises") as typeof import("node:fs/promises"),
    path: process.getBuiltinModule("node:path") as typeof import("node:path"),
  };
}

/**
 * Development-only source. The root directory is trusted server configuration;
 * callers can select only a relative scope beneath it.
 */
export class LocalFolderKnowledgeSource implements KnowledgeSource {
  readonly sourceKey: string;
  private readonly scope: string;
  private readonly rootDirectory: string;
  private readonly maxFileSize: number;

  constructor(
    rootDirectory: string,
    scope?: string,
    maxFileSize = MAX_SOURCE_FILE_SIZE,
  ) {
    this.rootDirectory = rootDirectory;
    this.maxFileSize = maxFileSize;
    this.scope = normalizeScope(scope);
    this.sourceKey = `local-folder:${this.scope || "."}`;
  }

  async listDocuments(projectId: string): Promise<SourceDocument[]> {
    const { fs, path } = getNodeModules();
    let root: string;
    let scopeRoot: string;
    try {
      root = await fs.realpath(this.rootDirectory);
      const requested = path.resolve(root, ...this.scope.split("/").filter(Boolean));
      assertContained(path, root, requested);
      scopeRoot = await fs.realpath(requested);
      assertContained(path, root, scopeRoot);
      if (!(await fs.stat(scopeRoot)).isDirectory()) {
        throw new LocalFolderSourceError("INVALID_SCOPE", "Source scope must be a directory.");
      }
    } catch (error) {
      if (error instanceof LocalFolderSourceError) throw error;
      throw new LocalFolderSourceError("SOURCE_UNAVAILABLE", "The configured local source is unavailable.");
    }

    const documents: SourceDocument[] = [];
    const walk = async (directory: string): Promise<void> => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const candidate = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await walk(candidate);
          continue;
        }
        if (!entry.isFile() || path.extname(entry.name).toLocaleLowerCase() !== ".docx") continue;

        const realFile = await fs.realpath(candidate);
        assertContained(path, root, realFile);
        const stats = await fs.stat(realFile);
        if (stats.size <= 0 || stats.size > this.maxFileSize) continue;
        const relativePath = path.relative(root, realFile).split(path.sep).join("/");
        const content = await fs.readFile(realFile);
        const checksum = await sha256(content);
        const documentId = await stableDocumentId(projectId, relativePath);

        documents.push({
          documentId,
          projectId,
          relativePath,
          fileName: path.basename(realFile),
          mimeType: DOCX_MIME_TYPE,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          checksum,
          version: `${Math.trunc(stats.mtimeMs)}-${stats.size}`,
          readContent: async () => {
            const currentRealPath = await fs.realpath(candidate);
            assertContained(path, root, currentRealPath);
            const current = await fs.readFile(currentRealPath);
            return current.buffer.slice(current.byteOffset, current.byteOffset + current.byteLength) as ArrayBuffer;
          },
        });
      }
    };

    try {
      await walk(scopeRoot);
    } catch (error) {
      if (error instanceof LocalFolderSourceError) throw error;
      throw new LocalFolderSourceError("SOURCE_UNAVAILABLE", "The configured local source could not be read.");
    }
    return documents.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }
}

export function createDefaultLocalFolderSource(scope?: string): LocalFolderKnowledgeSource {
  const { path } = getNodeModules();
  const configuredRoot = process.env.KNOWLEDGE_LOCAL_ROOT;
  const root = configuredRoot || path.resolve(process.cwd(), "..", "data", "無痛交接Demo資料_v2");
  return new LocalFolderKnowledgeSource(root, scope);
}
