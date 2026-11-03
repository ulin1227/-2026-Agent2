import { reviewHandoffFiles, type ReviewChecklistItem, type ReviewFile } from "@/lib/handoff/review";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    checklist?: unknown;
    files?: unknown;
  } | null;

  if (!payload || !Array.isArray(payload.checklist) || !Array.isArray(payload.files)) {
    return Response.json({ message: "請提供 checklist 與 files 陣列。" }, { status: 400 });
  }

  const checklist = payload.checklist.filter(
    (item): item is ReviewChecklistItem => typeof (item as ReviewChecklistItem)?.title === "string",
  );
  const files = payload.files.filter(
    (file): file is ReviewFile => typeof (file as ReviewFile)?.fileName === "string",
  );

  return Response.json(reviewHandoffFiles({ checklist, files }));
}
