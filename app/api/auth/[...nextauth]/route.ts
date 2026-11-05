import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/app/libs/auth-config";
import { ApiRequestError, readBoundedBody } from "@/app/libs/api-request";

const handler = NextAuth(authOptions);
type AuthContext = { params: Promise<{ nextauth: string[] }> };
export { handler as GET };

function authError(request: Request, error: string, message: string, status: number, retryAfter?: number) {
  const url = new URL("/signin", request.url);
  url.searchParams.set("error", error);
  return Response.json({ error: message, url: url.href }, { status, headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
}

export async function POST(request: NextRequest, context: AuthContext) {
  try {
    // Bound JSON and URL-encoded bodies before NextAuth parses them; retain
    // NextRequest.nextUrl and NextAuth's CSRF/cookie handling.
    const bytes = await readBoundedBody(request, 16384);
    const bounded = new NextRequest(request.url, { method: "POST", headers: request.headers, body: bytes });
    const response: Response = await handler(bounded, context);
    const { nextauth } = await context.params;
    // Only an unsuccessful JSON callback carries a credentials failure.
    // Successful return URLs are caller-selected and may contain "error".
    // Ordinary form callbacks retain NextAuth's redirect protocol.
    if (response.status === 401 && nextauth[0] === "callback" && nextauth[1] === "credentials") {
      const result = response.headers.get("content-type")?.includes("application/json") ? await response.clone().json() : null;
      const target = response.headers.get("location") ?? result?.url;
      const code = typeof target === "string" ? new URL(target, request.url).searchParams.get("error") : null;
      const match = code?.match(/^RateLimited:(\d+)$/);
      if (match) return authError(request, "RateLimited", "Too many sign-in attempts. Please wait before trying again.", 429, Number(match[1]));
      if (code === "AuthUnavailable") return authError(request, "AuthUnavailable", "Sign-in is temporarily unavailable. Please try again later.", 503);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiRequestError) return authError(request, "RequestTooLarge", error.message, error.status);
    if (error instanceof SyntaxError) return authError(request, "InvalidRequest", "Invalid sign-in request.", 400);
    return authError(request, "AuthUnavailable", "Sign-in is temporarily unavailable. Please try again later.", 503);
  }
}
