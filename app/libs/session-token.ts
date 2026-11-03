import { decode, type JWTDecodeParams } from "next-auth/jwt";
import prisma from "./prismadb";
import { logger } from "./logger";

// Used by both NextAuth and the authenticated-page proxy. Legacy JWTs have
// version "" and remain valid until the account’s first password reset.
export async function decodeSessionToken(params: JWTDecodeParams) {
  try {
    const token = await decode(params);
    if (!token?.sub || !token.email) return null;
    const user = await prisma.user.findUnique({
      where: { id: token.sub }, select: { email: true, sessionVersion: true },
    });
    if (!user || user.email !== token.email || (token.sessionVersion ?? "") !== (user.sessionVersion ?? "")) return null;
    return token;
  } catch {
    logger.warn("auth.session_decode_failed");
    return null;
  }
}
