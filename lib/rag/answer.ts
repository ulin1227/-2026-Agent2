import type { AnswerGenerator, AnswerResult, RetrievalHit } from "./contracts";

/** Safe fallback: returns evidence guidance without pretending to answer the question. */
export class EvidenceOnlyAnswerGenerator implements AnswerGenerator {
  async generate(_question: string, evidence: RetrievalHit[]): Promise<AnswerResult> {
    if (evidence.length === 0) {
      return {
        answer: "目前索引中找不到足以回應此問題的相關證據。",
        generated: false,
        generator: "evidence-only-fallback",
      };
    }
    return {
      answer: "目前未設定答案生成模型；以下僅列出與問題最相關的原文證據，請依引用位置查核原始文件。",
      generated: false,
      generator: "evidence-only-fallback",
    };
  }
}
