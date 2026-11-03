import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import {
  ingestSourceDocument,
  listSourceDocuments,
} from "@/lib/onboarding/generation";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const documents = await listSourceDocuments(caseId);
    return Response.json({ documents });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      caseId?: string;
      name?: string;
      sourceType?: string;
      content?: string;
      uploadedBy?: string;
    };

    const caseId = payload.caseId?.trim() || DEFAULT_CASE_ID;
    const name = payload.name?.trim() ?? "";
    const content = payload.content?.trim() ?? "";

    if (!name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    if (!content) {
      return Response.json({ error: "content is required" }, { status: 400 });
    }

    const document = await ingestSourceDocument(
      {
        name,
        sourceType: payload.sourceType,
        content,
        uploadedBy: payload.uploadedBy,
      },
      caseId,
    );

    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
