import { classifyEvidence, MissingOpenAIKeyError } from "../../../lib/agents/classify";
import { parseDocx } from "../../../lib/docx/parse";
import { buildMindMap } from "../../../lib/mindmap";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const MAX_EXTRACTED_TEXT = 750_000;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploadedFiles = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    const relativePaths = formData
      .getAll("relativePaths")
      .map((item) => typeof item === "string" ? item : "");
    const files = uploadedFiles
      .map((file, index) => ({ file, relativePath: relativePaths[index] || file.name }))
      .filter(({ file }) => file.name.toLowerCase().endsWith(".docx"));

    if (uploadedFiles.length === 0) {
      return jsonError("請提供一個包含文件的資料夾。", 400);
    }
    if (files.length === 0) {
      return jsonError("資料夾中沒有可處理的 DOCX 文件。", 400);
    }
    if (files.length > MAX_FILES) {
      return jsonError(`一次最多處理 ${MAX_FILES} 份 DOCX。`, 400);
    }
    if (files.some(({ file }) => file.size === 0 || file.size > MAX_FILE_SIZE)) {
      return jsonError("每份 DOCX 必須大於 0 且不超過 10 MB。", 400);
    }
    if (files.reduce((total, { file }) => total + file.size, 0) > MAX_TOTAL_SIZE) {
      return jsonError("整批 DOCX 合計不可超過 50 MB。", 400);
    }

    const documents = await Promise.all(
      files.map(async ({ file, relativePath }, index) =>
        parseDocx(
          await file.arrayBuffer(),
          relativePath.replace(/\\/g, "/").split("/").filter((part) => part && part !== "." && part !== "..").slice(-6).join("/") || file.name,
          index + 1,
        ),
      ),
    );
    const blocks = documents.flatMap((document) => document.blocks);
    const extractedTextLength = blocks.reduce((total, block) => total + block.text.length, 0);
    if (extractedTextLength > MAX_EXTRACTED_TEXT) {
      return jsonError("資料夾中的文字內容過多，請縮小範圍後再試一次。", 413);
    }
    const { classification, model } = await classifyEvidence(blocks);
    return Response.json({
      ...buildMindMap(classification, documents, model),
      ingestion: {
        scannedFiles: uploadedFiles.length,
        processedFiles: files.length,
        skippedFiles: uploadedFiles.length - files.length,
      },
    });
  } catch (error) {
    if (error instanceof MissingOpenAIKeyError) {
      return jsonError(error.message, 503);
    }
    const message = error instanceof Error ? error.message : "分析文件時發生未知錯誤。";
    console.error("handoff analysis failed", error);
    return jsonError(message, 500);
  }
}
