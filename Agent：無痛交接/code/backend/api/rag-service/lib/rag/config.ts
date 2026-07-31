export interface ChunkingConfig {
  maxCharacters: number;
  overlapCharacters: number;
}

/** One place to tune chunk behavior when an embedding backend is introduced. */
export const CHUNKING_CONFIG: Readonly<ChunkingConfig> = Object.freeze({
  maxCharacters: 1_200,
  overlapCharacters: 180,
});

export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 20;
export const MAX_SOURCE_FILE_SIZE = 10 * 1024 * 1024;
