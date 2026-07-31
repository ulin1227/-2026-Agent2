import { clearSessionCookie, deleteRequestSession } from "@/lib/auth";

export async function POST(request: Request) {
  await deleteRequestSession(request);
  const response = Response.json({ ok: true });
  response.headers.set("set-cookie", clearSessionCookie(request));
  return response;
}
