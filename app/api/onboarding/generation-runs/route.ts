import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import {
  createGenerationRun,
  executeGenerationRun,
  listGenerationRuns,
} from "@/lib/onboarding/generation";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const runs = await listGenerationRuns(caseId);
    return Response.json({ runs });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      caseId?: string;
      model?: string;
      promptVersion?: string;
      overwriteStrategy?: "replace_generated_only" | "reset_all";
      executeNow?: boolean;
    };

    const run = await createGenerationRun({
      caseId: payload.caseId ?? DEFAULT_CASE_ID,
      model: payload.model,
      promptVersion: payload.promptVersion,
      overwriteStrategy: payload.overwriteStrategy,
    });

    const finalRun = payload.executeNow === false ? run : await executeGenerationRun(run.id);
    return Response.json({ run: finalRun }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
