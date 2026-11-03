export type ServiceAccess =
  | { allowed: true; method: "sites-user" | "bearer" | "local-development" }
  | { allowed: false; status: 401 | 503; error: string };

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function authorizeRagService(request: Request): ServiceAccess {
  if (request.headers.get("oai-authenticated-user-email")?.trim()) {
    return { allowed: true, method: "sites-user" };
  }
  const expected = process.env.RAG_SERVICE_API_KEY?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return {
        allowed: false,
        status: 503,
        error: "RAG service authentication is not configured.",
      };
    }
    return { allowed: true, method: "local-development" };
  }
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return constantTimeEqual(token, expected)
    ? { allowed: true, method: "bearer" }
    : { allowed: false, status: 401, error: "A valid RAG service bearer token is required." };
}
