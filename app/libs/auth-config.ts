import { decodeSessionToken } from "./session-token";
import bcrypt from "bcrypt";
import { AuthOptions } from "next-auth";
import type { AdapterAccount, AdapterUser } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";

import prisma from "./prismadb";
import { githubUserinfo } from "./github-userinfo";
import { enforceAbuseLimit } from "./abuse-limits";
import { loginCredentialsSchema } from "@/app/schemas/account";
import { ApiRequestError } from "./api-request";
import { assertEmailAvailable, findUsersByEmailIdentity } from "./email-identity";
import { normalizeEmail } from "@/app/utils/email";

const prismaAdapter = PrismaAdapter(prisma);

export const authOptions: AuthOptions = {
  adapter: {
    ...prismaAdapter,
    async createUser(data: Omit<AdapterUser, "id">) {
      const email = await assertEmailAvailable(data.email);
      return prismaAdapter.createUser!({ ...data, email });
    },
    async getUserByEmail(email: string) {
      const users = await findUsersByEmailIdentity(email);
      // Never let an ambiguous lookup choose an account or proceed to signup.
      if (users.length > 1) throw new Error("This email needs account support.");
      const user = users[0];
      return user?.email ? { ...user, email: user.email } : null;
    },
    async updateUser({ id, email, ...data }) {
      if (email !== undefined) {
        const current = await prisma.user.findUnique({ where: { id }, select: { email: true } });
        // Email changes are not a supported account flow. A canonical no-op
        // keeps the original spelling, preserving sessions and pending proofs.
        if (!current?.email || normalizeEmail(email) !== normalizeEmail(current.email)) {
          throw new Error("Account email changes are not supported.");
        }
      }
      return prismaAdapter.updateUser!({ id, ...data });
    },
    async linkAccount(account: AdapterAccount) {
      // NextAuth also links new providers to a signed-in user, regardless of
      // allowDangerousEmailAccountLinking. An unverified password signup must
      // never plant another login method that survives password recovery.
      const user = await prisma.user.findUnique({
        where: { id: account.userId },
        select: { hashedPassword: true },
      });
      if (!user || user.hashedPassword) {
        throw new Error("New OAuth connections to password accounts are not supported.");
      }
      // Initial OAuth signup creates a user without a password. Existing
      // provider-subject sign-ins use getUserByAccount and do not link again.
      return prismaAdapter.linkAccount!(account);
    },
  },
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

        let user = await prisma.user.findUnique({
          where: {
            email,
          },
        });
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
            : ((
                await prisma.user.findUnique({
                  where: { id: user.id },
                  select: { sessionVersion: true },
                })
              )?.sessionVersion ?? "");
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
