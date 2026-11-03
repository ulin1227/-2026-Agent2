import { extractDocxText } from "@/lib/docx/parse";

// Text extraction for the handoff upload and supervisor review modules (public/legacy).
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 20;
const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".yaml", ".yml", ".html", ".xml"];

type ExtractionStatus = "ok" | "unsupported" | "failed";

type DocumentResult = {
  ok: boolean;
  fileName: string;
  size: number;
  extractionStatus: ExtractionStatus;
  extractedText: string;
  message?: string;
};

async function extractFile(file: File): Promise<DocumentResult> {
  const name = file.name.toLowerCase();
  const base = { fileName: file.name, size: file.size };

  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return { ...base, ok: false, extractionStatus: "failed", extractedText: "", message: "檔案必須大於 0 且不超過 10 MB。" };
  }

  try {
    if (name.endsWith(".docx")) {
      const extractedText = await extractDocxText(await file.arrayBuffer());
      return { ...base, ok: true, extractionStatus: "ok", extractedText };
    }
    if (file.type.startsWith("text/") || TEXT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      return { ...base, ok: true, extractionStatus: "ok", extractedText: (await file.text()).trim() };
    }
    return {
      ...base,
      ok: false,
      extractionStatus: "unsupported",
      extractedText: "",
      message: name.endsWith(".pdf")
        ? "目前尚未支援 PDF 文字擷取，請改上傳 DOCX 或文字檔。"
        : "不支援此檔案格式，請上傳 DOCX 或文字檔。",
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      extractionStatus: "failed",
      extractedText: "",
      message: error instanceof Error ? error.message : "文件解析失敗。",
    };
  }
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const files = form
    ? [...form.getAll("file"), ...form.getAll("files")].filter((item): item is File => item instanceof File)
    : [];

  if (files.length === 0) {
    return Response.json({ ok: false, message: "請以 multipart/form-data 上傳 file 欄位。" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return Response.json({ ok: false, message: `一次最多處理 ${MAX_FILES} 份檔案。` }, { status: 400 });
  }

  const documents = await Promise.all(files.map(extractFile));
  return Response.json({ ok: true, documents });
}
