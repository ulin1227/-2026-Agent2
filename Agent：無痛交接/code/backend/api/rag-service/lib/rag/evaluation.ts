import type { RetrievalHit } from "./contracts";
import type { RetrievalService } from "./retrieval";

export interface GoldenQuestion {
  id: string;
  question: string;
  /** Legacy single-label fields kept for small fixtures and existing callers. */
  expectedFileNameIncludes?: string;
  expectedTextIncludes?: string;
  /** A hit is relevant when it satisfies every text condition in any label. */
  relevantEvidence?: Array<{
    fileNameIncludes: string;
    allTextIncludes: string[];
  }>;
}

export interface QuestionEvaluation {
  id: string;
  question: string;
  rank: number | null;
  matched: boolean;
  topCitation?: string;
}

export interface RetrievalEvaluation {
  strategy: string;
  topK: number;
  hitRateAtK: number;
  meanReciprocalRank: number;
  questions: QuestionEvaluation[];
}

export function expectedRank(hits: RetrievalHit[], question: GoldenQuestion): number | null {
  const labels = question.relevantEvidence ?? (
    question.expectedFileNameIncludes && question.expectedTextIncludes
      ? [{
          fileNameIncludes: question.expectedFileNameIncludes,
          allTextIncludes: [question.expectedTextIncludes],
        }]
      : []
  );
  if (labels.length === 0) throw new Error(`Golden question ${question.id} has no evidence label.`);
  const rank = hits.findIndex((hit) => labels.some((label) =>
    hit.metadata.fileName.includes(label.fileNameIncludes) &&
    label.allTextIncludes.every((text) => hit.text.includes(text))));
  return rank < 0 ? null : rank + 1;
}

export async function evaluateRetrieval(
  retrieval: RetrievalService,
  projectId: string,
  questions: GoldenQuestion[],
  topK: number,
): Promise<RetrievalEvaluation> {
  const results: QuestionEvaluation[] = [];
  let strategy = "unknown";
  for (const question of questions) {
    const result = await retrieval.retrieve(projectId, question.question, topK);
    strategy = result.strategy;
    const rank = expectedRank(result.hits, question);
    const top = result.hits[0];
    results.push({
      id: question.id,
      question: question.question,
      rank,
      matched: rank !== null,
      topCitation: top ? `${top.metadata.fileName}｜${top.metadata.locator}` : undefined,
    });
  }
  const hits = results.filter((result) => result.matched).length;
  const reciprocalRank = results.reduce(
    (total, result) => total + (result.rank ? 1 / result.rank : 0),
    0,
  );
  return {
    strategy,
    topK,
    hitRateAtK: questions.length ? hits / questions.length : 0,
    meanReciprocalRank: questions.length ? reciprocalRank / questions.length : 0,
    questions: results,
  };
}
