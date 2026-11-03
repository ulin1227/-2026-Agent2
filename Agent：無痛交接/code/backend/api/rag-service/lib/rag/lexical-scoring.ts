export function lexicalTerms(value: string): Set<string> {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const result = new Set(normalized.match(/[\p{L}\p{N}_-]+/gu) ?? []);
  const cjkRuns = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? [];
  for (const run of cjkRuns) {
    for (let index = 0; index < run.length - 1; index += 1) result.add(run.slice(index, index + 2));
  }
  return result;
}

export function lexicalScore(question: string, text: string): number {
  const queryTerms = lexicalTerms(question);
  const textTerms = lexicalTerms(text);
  if (queryTerms.size === 0 || textTerms.size === 0) return 0;
  let overlap = 0;
  for (const term of queryTerms) if (textTerms.has(term)) overlap += 1;
  if (overlap === 0) return 0;
  const cosineLike = overlap / Math.sqrt(queryTerms.size * textTerms.size);
  const normalizedQuestion = question.normalize("NFKC").trim().toLocaleLowerCase();
  const phraseBonus = normalizedQuestion.length >= 2 &&
    text.normalize("NFKC").toLocaleLowerCase().includes(normalizedQuestion) ? 0.25 : 0;
  return Number((cosineLike + phraseBonus).toFixed(8));
}

/** Scores the best local evidence row instead of diluting it inside a long chunk. */
export function focusedEvidenceScore(question: string, text: string): number {
  const rows = text.split(/\r?\n+/u).map((row) => row.trim()).filter(Boolean);
  return rows.reduce((best, row) => Math.max(best, lexicalScore(question, row)), 0);
}
