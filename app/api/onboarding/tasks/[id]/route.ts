import { DEFAULT_CASE_ID } from "@/lib/onboarding/constants";
import { listEnrichedTasks, updateTaskStatusById } from "@/lib/onboarding/serverData";
import type { TaskStatus } from "@/lib/onboarding/types";

const allowedStatuses = new Set<TaskStatus>(["待處理", "進行中", "已完成"]);

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const { id } = await context.params;
    const payload = (await request.json()) as { status?: TaskStatus };
    const status = payload.status;

    if (!status || !allowedStatuses.has(status)) {
      return Response.json({ error: "status is invalid" }, { status: 400 });
    }

    await updateTaskStatusById(id, status, caseId);
    const tasks = await listEnrichedTasks(caseId);
    const task = tasks.find((candidate) => candidate.id === id);

    if (!task) {
      return Response.json({ error: "task not found" }, { status: 404 });
    }

    return Response.json({ task });
  } catch (error) {
    const message = toErrorMessage(error);
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
