import { executeGenerationRun, getGenerationRun } from "@/lib/onboarding/generation";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const run = await getGenerationRun(id);

    if (!run) {
      return Response.json({ error: "generation run not found" }, { status: 404 });
    }

    return Response.json({ run });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const run = await executeGenerationRun(id);

    if (!run) {
      return Response.json({ error: "generation run not found" }, { status: 404 });
    }

    return Response.json({ run });
  } catch (error) {
    const message = toErrorMessage(error);
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
