import type { EvidenceBlock, ParsedDocument } from "../mindmap";
import type { KnowledgeChunk, SourceDocument } from "./contracts";
import { CHUNKING_CONFIG, type ChunkingConfig } from "./config";

interface ChunkUnit {
  text: string;
  locator: string;
  kind: string;
}

function splitOversizedBlock(block: EvidenceBlock, config: ChunkingConfig): ChunkUnit[] {
  const normalized = block.text.replace(/\s+/g, " ").trim();
  if (normalized.length <= config.maxCharacters) {
    return [{ text: normalized, locator: block.locator, kind: block.kind }];
  }

  const units: ChunkUnit[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + config.maxCharacters);
    if (end < normalized.length) {
      const candidate = normalized.slice(start, end);
      const breakAt = Math.max(
        candidate.lastIndexOf("。"),
        candidate.lastIndexOf("；"),
        candidate.lastIndexOf("!"),
        candidate.lastIndexOf("?"),
        candidate.lastIndexOf(" "),
      );
      if (breakAt >= Math.floor(config.maxCharacters * 0.6)) end = start + breakAt + 1;
    }
    units.push({
      text: normalized.slice(start, end).trim(),
      locator: block.locator,
      kind: block.kind,
    });
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - config.overlapCharacters);
  }
  return units;
}

function trailingOverlap(units: ChunkUnit[], limit: number): ChunkUnit[] {
  const overlap: ChunkUnit[] = [];
  let length = 0;
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (overlap.length > 0 && length + unit.text.length > limit) break;
    overlap.unshift(unit);
    length += unit.text.length + 1;
    if (length >= limit) break;
  }
  return overlap;
}

function chunkLocator(units: ChunkUnit[]): { locator: string; locators: string[] } {
  const locators = Array.from(new Set(units.map((unit) => unit.locator)));
  return {
    locator: locators.length === 1 ? locators[0] : `${locators[0]} – ${locators.at(-1)}`,
    locators,
  };
}

export function chunkDocument(
  source: SourceDocument,
  parsed: ParsedDocument,
  config: ChunkingConfig = CHUNKING_CONFIG,
): KnowledgeChunk[] {
  if (config.maxCharacters < 100 || config.overlapCharacters < 0 ||
      config.overlapCharacters >= config.maxCharacters) {
    throw new Error("Invalid chunk configuration.");
  }

  const sourceUnits = parsed.blocks.flatMap((block) => splitOversizedBlock(block, config));
  const grouped: ChunkUnit[][] = [];
  let current: ChunkUnit[] = [];
  let currentLength = 0;

  for (const unit of sourceUnits) {
    const nextLength = currentLength + (current.length ? 1 : 0) + unit.text.length;
    if (current.length > 0 && nextLength > config.maxCharacters) {
      grouped.push(current);
      current = trailingOverlap(current, config.overlapCharacters);
      currentLength = current.reduce((total, item) => total + item.text.length + 1, 0);
      while (current.length > 0 && currentLength + unit.text.length + 1 > config.maxCharacters) {
        const removed = current.shift();
        currentLength -= (removed?.text.length ?? 0) + 1;
      }
    }
    current.push(unit);
    currentLength += (current.length > 1 ? 1 : 0) + unit.text.length;
  }
  if (current.length > 0) grouped.push(current);

  return grouped.map((units, chunkIndex) => {
    const { locator, locators } = chunkLocator(units);
    const kinds = Array.from(new Set(units.map((unit) => unit.kind)));
    return {
      id: `${source.documentId}:chunk:${chunkIndex}`,
      text: units.map((unit) => unit.text).join("\n"),
      metadata: {
        projectId: source.projectId,
        documentId: source.documentId,
        relativePath: source.relativePath,
        fileName: source.fileName,
        locator,
        locators,
        chunkIndex,
        kind: kinds.length === 1 ? kinds[0] : "mixed",
      },
    };
  });
}
