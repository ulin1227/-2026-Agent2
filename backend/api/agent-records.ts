import { listAgentRecords } from "@/backend/services/agent-records";

export function getAgentRecords() {
  return Response.json({
    records: listAgentRecords(),
  });
}
