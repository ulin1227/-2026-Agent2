import { DEFAULT_TOP_K, MAX_TOP_K } from "./config";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function projectIdValue(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new RequestValidationError("projectId is required and has an invalid format.");
  }
  return value;
}

export interface SyncRequestBody {
  projectId: string;
  source: { type: "local-folder"; scope?: string };
}

export function parseSyncRequest(value: unknown): SyncRequestBody {
  const body = objectValue(value);
  const source = objectValue(body.source);
  if (source.type !== "local-folder") {
    throw new RequestValidationError("source.type must be local-folder in this development version.");
  }
  if (source.scope !== undefined && (typeof source.scope !== "string" || source.scope.length > 512)) {
    throw new RequestValidationError("source.scope must be a relative string of at most 512 characters.");
  }
  return {
    projectId: projectIdValue(body.projectId),
    source: { type: "local-folder", scope: source.scope as string | undefined },
  };
}

export interface QueryRequestBody {
  projectId: string;
  question: string;
  topK: number;
}

export function parseQueryRequest(value: unknown): QueryRequestBody {
  const body = objectValue(value);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 4_000) {
    throw new RequestValidationError("question is required and must not exceed 4000 characters.");
  }
  const topK = body.topK === undefined ? DEFAULT_TOP_K : body.topK;
  if (!Number.isInteger(topK) || (topK as number) < 1 || (topK as number) > MAX_TOP_K) {
    throw new RequestValidationError(`topK must be an integer between 1 and ${MAX_TOP_K}.`);
  }
  return { projectId: projectIdValue(body.projectId), question, topK: topK as number };
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    throw new RequestValidationError("Content-Type must be application/json.");
  }
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("Request body must contain valid JSON.");
  }
}
