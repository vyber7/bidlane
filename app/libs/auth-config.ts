import { decodeSessionToken } from "./session-token";
import bcrypt from "bcrypt";
import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { nativeAuthAdapter } from "./auth-adapter";

import { getNativeRepositories } from "./native-repositories";
import { githubUserinfo } from "./github-userinfo";
import { enforceAbuseLimit } from "./abuse-limits";
import { loginCredentialsSchema } from "@/app/schemas/account";
import { ApiRequestError } from "./api-request";
import { findUsersByEmailIdentity } from "./email-identity";

export const authOptions: AuthOptions = {
  adapter: nativeAuthAdapter(),
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID as string,
      clientSecret: process.env.GITHUB_SECRET as string,
      // Verified provider email does not authorize merging existing accounts.
      userinfo: githubUserinfo,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "email", type: "text" },
        password: { label: "password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginCredentialsSchema.safeParse(credentials);
        if (!parsed.success) throw new Error("Invalid Credentials");
        const { email, password } = parsed.data;
        try {
          await enforceAbuseLimit("login", email);
        } catch (error) {
          // NextAuth transports only error.message for credentials failures.
          if (error instanceof ApiRequestError && error.status === 429) throw new Error(`RateLimited:${error.retryAfter}`);
          throw new Error("AuthUnavailable");
        }

        let user = await getNativeRepositories().users.byEmail(email);
        if (!user) {
          const matches = await findUsersByEmailIdentity(email);
          // Keep exact legacy logins above, but never guess among collisions.
          user = matches.length === 1 ? matches[0] : null;
        }

        if (!user || !user?.hashedPassword) {
          throw new Error("Invalid Credentials");
        }

        const isCorrectPassword = await bcrypt.compare(
          password,
          user.hashedPassword,
        );

        if (!isCorrectPassword) {
          throw new Error("Invalid Credentials");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          sessionVersion: user.sessionVersion ?? "",
        };
      },
    }),
  ],
  jwt: { decode: decodeSessionToken },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        // Credentials carry the version read BEFORE the password comparison,
        // so a login racing a reset cannot inherit the newly reset session.
        token.sessionVersion =
          account?.provider === "credentials" && "sessionVersion" in user
            ? user.sessionVersion
            : (await getNativeRepositories().users.sessionIdentity(user.id))?.sessionVersion ?? "";
      }
      // Never refresh the version from client-supplied session updates.
      return token;
    },
  },
  debug: process.env.NODE_ENV === "development",
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
