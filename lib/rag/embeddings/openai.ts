import type { EmbeddingProvider } from "../contracts";

const DEFAULT_BATCH_SIZE = 64;

export class EmbeddingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingConfigurationError";
  }
}

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions?: number;
  batchSize?: number;
  fetchImpl?: typeof fetch;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: unknown; index?: unknown }>;
  model?: unknown;
}

export function resolveEmbeddingsEndpoint(baseUrl: string): string {
  if (!baseUrl.trim()) {
    throw new EmbeddingConfigurationError("Embedding base URL is required.");
  }
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const endpoint = normalized.endsWith("/embeddings") ? normalized : `${normalized}/embeddings`;
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new EmbeddingConfigurationError("Embedding base URL must use http or https.");
  }
  return parsed.toString();
}

function validateVector(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new Error("Embedding API returned an invalid vector.");
  }
  return value as number[];
}

/** Server-only OpenAI-compatible /embeddings client with deterministic output ordering. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly dimensions?: number;
  private readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIEmbeddingProviderOptions) {
    if (!options.apiKey.trim()) throw new EmbeddingConfigurationError("Embedding API key is required.");
    if (!options.model.trim()) {
      throw new EmbeddingConfigurationError("Embedding model is required.");
    }
    if (options.dimensions !== undefined &&
        (!Number.isInteger(options.dimensions) || options.dimensions < 1)) {
      throw new EmbeddingConfigurationError("Embedding dimensions must be a positive integer.");
    }
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2_048) {
      throw new EmbeddingConfigurationError("Embedding batch size must be between 1 and 2048.");
    }
    this.apiKey = options.apiKey;
    this.endpoint = resolveEmbeddingsEndpoint(options.baseUrl);
    this.model = options.model.trim();
    this.dimensions = options.dimensions;
    this.batchSize = batchSize;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.some((text) => !text.trim())) throw new Error("Embedding input cannot be empty.");
    const result: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      result.push(...await this.embedBatch(texts.slice(offset, offset + this.batchSize)));
    }
    return result;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedDocuments([text]);
    return vector;
  }

  private async embedBatch(input: string[]): Promise<number[][]> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input,
        encoding_format: "float",
        ...(this.dimensions === undefined ? {} : { dimensions: this.dimensions }),
      }),
    });
    if (!response.ok) {
      throw new Error(`Embedding API request failed with status ${response.status}.`);
    }
    const payload = await response.json() as EmbeddingResponse;
    if (!Array.isArray(payload.data) || payload.data.length !== input.length) {
      throw new Error("Embedding API returned an unexpected number of vectors.");
    }
    const ordered = payload.data
      .map((item) => ({ index: item.index, vector: validateVector(item.embedding) }))
      .sort((left, right) => {
        if (!Number.isInteger(left.index) || !Number.isInteger(right.index)) {
          throw new Error("Embedding API returned an invalid index.");
        }
        return (left.index as number) - (right.index as number);
      });
    const dimension = ordered[0]?.vector.length;
    if (!dimension || ordered.some((item) => item.vector.length !== dimension)) {
      throw new Error("Embedding API returned inconsistent vector dimensions.");
    }
    if (ordered.some((item, index) => item.index !== index)) {
      throw new Error("Embedding API returned duplicate or out-of-range indexes.");
    }
    return ordered.map((item) => item.vector);
  }
}

export function createOpenAIEmbeddingProviderFromEnvironment(): OpenAIEmbeddingProvider {
  const dimensionsValue = process.env.RAG_EMBEDDING_DIMENSIONS?.trim();
  const dimensions = dimensionsValue ? Number(dimensionsValue) : undefined;
  return new OpenAIEmbeddingProvider({
    apiKey: process.env.RAG_EMBEDDING_API_KEY ?? "",
    baseUrl: process.env.RAG_EMBEDDING_BASE_URL ?? "",
    model: process.env.RAG_EMBEDDING_MODEL ?? "",
    dimensions,
  });
}
