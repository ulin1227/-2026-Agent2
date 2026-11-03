import { reviewWithLlm } from "@/lib/handoff/llm-client";
import { reviewHandoffDocuments, type ReviewInput } from "@/lib/handoff/review-engine";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as ReviewInput | null;
  if (!input || typeof input !== "object") {
    return Response.json({ ok: false, message: "無法解析上傳檢查內容，請確認資料格式正確。" }, { status: 400 });
  }

  const ruleReview = reviewHandoffDocuments(input);
  try {
    return Response.json(await reviewWithLlm(input, ruleReview));
  } catch (error) {
    // Keep the check usable when the LLM endpoint is down: fall back to the rule-based result.
    console.error("handoff LLM review failed", error);
    return Response.json({
      ...ruleReview,
      summary: `${ruleReview.summary}（LLM 檢查失敗，已改用規則檢查）`,
      agentProvider: "rules",
      llmError: error instanceof Error ? error.message : "LLM 檢查失敗",
    });
  }
}
