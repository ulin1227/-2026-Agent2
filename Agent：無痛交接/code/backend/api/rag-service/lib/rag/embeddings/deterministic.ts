import type { EmbeddingProvider } from "../contracts";

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function features(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const result = normalized.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const cjkRuns = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? [];
  for (const run of cjkRuns) {
    for (let index = 0; index < run.length - 1; index += 1) {
      result.push(run.slice(index, index + 2));
    }
  }
  return result;
}

/**
 * Offline feature hashing for pipeline tests. This is not a semantic embedding
 * model and its evaluation numbers must not be presented as vector quality.
 */
export class DeterministicHashEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;

  constructor(private readonly dimensions = 256) {
    if (!Number.isInteger(dimensions) || dimensions < 8) {
      throw new Error("Deterministic embedding dimensions must be an integer of at least 8.");
    }
    this.model = `deterministic-feature-hash-mock-v1:${dimensions}`;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embed(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }

  private embed(text: string): number[] {
    const vector = Array.from<number>({ length: this.dimensions }).fill(0);
    const tokens = features(text);
    if (tokens.length === 0) vector[0] = 1;
    for (const token of tokens) {
      const hash = fnv1a(token);
      const index = hash % this.dimensions;
      vector[index] += (hash & 0x80000000) === 0 ? 1 : -1;
    }
    const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
    return vector.map((item) => item / norm);
  }
}
