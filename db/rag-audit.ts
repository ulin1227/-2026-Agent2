import { desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { ragRetrievalLogs } from "./schema";
import type { RetrievalAuditRecord } from "../lib/rag/audit";

export async function insertRetrievalAudit(record: RetrievalAuditRecord): Promise<void> {
  await getDb().insert(ragRetrievalLogs).values({
    ...record,
    citationsJson: JSON.stringify(record.citations),
  });
}

export async function selectRetrievalAudits(
  projectId: string | undefined,
  limit: number,
): Promise<RetrievalAuditRecord[]> {
  const db = getDb();
  const rows = projectId
    ? await db.select().from(ragRetrievalLogs)
        .where(eq(ragRetrievalLogs.projectId, projectId))
        .orderBy(desc(ragRetrievalLogs.createdAt)).limit(limit)
    : await db.select().from(ragRetrievalLogs)
        .orderBy(desc(ragRetrievalLogs.createdAt)).limit(limit);
  return rows.map((row) => ({
    ...row,
    citations: JSON.parse(row.citationsJson) as RetrievalAuditRecord["citations"],
  }));
}
