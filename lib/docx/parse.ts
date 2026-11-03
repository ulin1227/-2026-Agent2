import type { EvidenceBlock, ParsedDocument } from "../mindmap";

const textDecoder = new TextDecoder("utf-8");
const MAX_UNCOMPRESSED_DOCUMENT_XML = 12 * 1024 * 1024;

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ownedBuffer = data.slice().buffer as ArrayBuffer;
  const stream = new Blob([ownedBuffer]).stream().pipeThrough(
    new DecompressionStream("deflate-raw" as CompressionFormat),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(buffer: ArrayBuffer, wantedName: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocdOffset = -1;
  const minimum = Math.max(0, bytes.length - 65_557);

  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("找不到 DOCX 的 ZIP 目錄。");

  const entryCount = readUint16(view, eocdOffset + 10);
  let offset = readUint32(view, eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) {
      throw new Error("DOCX ZIP 目錄格式不正確。");
    }
    const compression = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (name === wantedName) {
      if (uncompressedSize > MAX_UNCOMPRESSED_DOCUMENT_XML) {
        throw new Error("DOCX 內容過大，已停止解析。");
      }
      if (readUint32(view, localHeaderOffset) !== 0x04034b50) {
        throw new Error("DOCX ZIP 項目格式不正確。");
      }
      const localNameLength = readUint16(view, localHeaderOffset + 26);
      const localExtraLength = readUint16(view, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      if (compression === 0) return compressed;
      if (compression === 8) return inflateRaw(compressed);
      throw new Error(`不支援 DOCX ZIP 壓縮格式 ${compression}。`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error("DOCX 缺少 word/document.xml。");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function textFromFragment(fragment: string): string {
  const pieces: string[] = [];
  const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  for (const match of fragment.matchAll(tokenPattern)) {
    if (match[1] !== undefined) pieces.push(decodeXml(match[1]));
    else pieces.push(" ");
  }
  return pieces.join("").replace(/\s+/g, " ").trim();
}

function blankOutRanges(value: string, ranges: Array<[number, number]>): string {
  const chars = value.split("");
  for (const [start, end] of ranges) chars.fill(" ", start, end);
  return chars.join("");
}

function tableRowText(cells: string[], headers: string[]): string {
  return cells
    .map((cell, index) => {
      const header = headers[index]?.trim();
      if (!cell) return "";
      return header && header !== cell ? `${header}：${cell}` : cell;
    })
    .filter(Boolean)
    .join("｜");
}

export async function parseDocx(
  buffer: ArrayBuffer,
  fileName: string,
  documentIndex: number,
): Promise<ParsedDocument> {
  const xml = textDecoder.decode(await readZipEntry(buffer, "word/document.xml"));
  const blocks: EvidenceBlock[] = [];
  const tableRanges: Array<[number, number]> = [];
  let tableCount = 0;

  const tablePattern = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  for (const tableMatch of xml.matchAll(tablePattern)) {
    const tableXml = tableMatch[0];
    const start = tableMatch.index ?? 0;
    tableRanges.push([start, start + tableXml.length]);
    tableCount += 1;
    const rows: string[][] = [];

    for (const rowMatch of tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const cells = Array.from(
        rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g),
        (cellMatch) => textFromFragment(cellMatch[0]),
      );
      if (cells.some(Boolean)) rows.push(cells);
    }

    const headers = rows[0] ?? [];
    rows.forEach((row, rowIndex) => {
      const text = tableRowText(row, rowIndex === 0 ? [] : headers);
      if (!text) return;
      blocks.push({
        id: `ev-d${documentIndex}-t${tableCount}-r${rowIndex + 1}`,
        fileName,
        locator: `表 ${tableCount}／第 ${rowIndex + 1} 列`,
        kind: "table_row",
        text,
      });
    });
  }

  const xmlWithoutTables = blankOutRanges(xml, tableRanges);
  let paragraphCount = 0;
  for (const paragraphMatch of xmlWithoutTables.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const text = textFromFragment(paragraphMatch[0]);
    if (!text) continue;
    paragraphCount += 1;
    blocks.push({
      id: `ev-d${documentIndex}-p${paragraphCount}`,
      fileName,
      locator: `段落 ${paragraphCount}`,
      kind: "paragraph",
      text,
    });
  }

  if (blocks.length === 0) throw new Error(`${fileName} 沒有可解析的文字內容。`);

  return { fileName, paragraphCount, tableCount, blocks };
}
