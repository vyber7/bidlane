import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Long, ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import bcrypt from "bcrypt";
import { encode } from "next-auth/jwt";
import type { Account, User } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import {
  createNativeRepositories,
  type NativeRepositories,
} from "./repositories";
import { ensureNativeIndexes } from "./indexes.mjs";

const state = vi.hoisted(() => ({
  connection: undefined as DatabaseV8 | undefined,
  session: null as { user: { email: string; role?: string } } | null,
}));
vi.mock("@/app/libs/prismadb-v8", () => ({
  getDatabaseV8: () => {
    if (!state.connection)
      throw new Error("Local auth database is not initialized");
    return state.connection;
  },
}));
vi.mock("@/app/actions/getSession", () => ({
  getSession: async () => state.session,
}));

import { authOptions } from "@/app/libs/auth-config";
import { decodeSessionToken } from "@/app/libs/session-token";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { requireAdmin } from "@/app/libs/admin";
import { POST as register } from "@/app/api/register/route";
import { PATCH as profile } from "@/app/api/account/profile/route";
import { PATCH as preferences } from "@/app/api/account/notification-preferences/route";
import { resetHash, resetPassword } from "@/app/libs/password-reset";
import { changeAdminRole } from "@/scripts/admin-role.mjs";

const load = createRequire(import.meta.url);
const core = join(dirname(load.resolve("next-auth")), "core");
const handleLogin = load(join(core, "lib/callback-handler.js"))
  .default as (input: {
  sessionToken?: string;
  profile: User;
  account: Account;
  options: Record<string, unknown>;
}) => Promise<{ user: AdapterUser; isNewUser: boolean }>;
const { adapterErrorHandler } = load(join(core, "errors.js")) as {
  adapterErrorHandler: (
    adapter: Adapter,
    logger: { debug: () => void; error: () => void },
  ) => Adapter;
};
const secret = "local-native-auth-test-secret";
const request = (body: unknown) =>
  new Request("http://localhost/api/account", {
    method: "POST",
    body: JSON.stringify(body),
  });

const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "native authentication on a local MongoDB replica set",
  () => {
    let connection: DatabaseV8;
    let repositories: NativeRepositories;
    let localUrl: string;
    beforeAll(async () => {
      const parsed = new ConnectionString(url!);
      if (
        parsed.hosts.length !== 1 ||
        !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) ||
        !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)
      )
        throw new Error(
          "Auth integration tests require a loopback bidlane_test_native_ database",
        );
      // Isolate from the string-ID integration suite even when run in parallel.
      parsed.pathname += "_auth";
      localUrl = parsed.toString();
      connection = createDatabaseV8(localUrl);
      state.connection = connection;
      await connection.mongoClient.connect();
      // The guarded local database is disposable, including stale indexes or
      // validators left by a previously interrupted integration run.
      await connection.database.dropDatabase();
      await ensureNativeIndexes(connection.database);
      repositories = createNativeRepositories(connection.database);
    }, 30_000);
    beforeEach(async () => {
      for (const collection of await connection.database
        .listCollections()
        .toArray())
        await connection.database.collection(collection.name).deleteMany({});
      state.session = null;
      vi.stubEnv("NEXTAUTH_SECRET", secret);
      vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net");
      vi.stubEnv("RESEND_API_KEY", "local-test-no-email-sent");
      vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>");
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      if (connection) {
        await connection.database.dropDatabase();
        await connection.close();
        state.connection = undefined;
      }
    }, 30_000);

    function oauth(
      providerId: string,
      email: string,
      sessionToken?: string,
      subject = "provider-subject",
    ) {
      const provider = authOptions.providers.find(
        (item) => item.id === providerId,
      ) as OAuthConfig<unknown>;
      return handleLogin({
        sessionToken,
        profile: { id: subject, name: "Driver", email },
        account: {
          provider: providerId,
          providerAccountId: subject,
          type: "oauth",
        },
        options: {
          adapter: adapterErrorHandler(authOptions.adapter!, {
            debug() {},
            error() {},
          }),
          events: {},
          session: authOptions.session,
          jwt: { ...authOptions.jwt, secret },
          provider: { ...provider, ...provider.options },
        },
      });
    }

    it("registers with explicit defaults, ObjectId storage and a public account DTO", async () => {
      const response = await register(
        request({
          name: "Driver",
          email: " Driver@Example.COM ",
          password: "a long password",
          role: "ADMIN",
          sessionVersion: "attacker",
          emailVerified: new Date(),
        }),
      );
      expect(response.status).toBe(201);
      const { id } = await response.json();
      const raw = await connection.database
        .collection("User")
        .findOne({ _id: new ObjectId(id) });
      expect(raw).toMatchObject({
        email: "driver@example.com",
        role: "USER",
        emailVerified: null,
        sessionVersion: null,
        outbidEmailsEnabled: true,
        endingSoonEmailsEnabled: true,
        listingsCommentedOnIds: [],
        watchListIds: [],
        BidOnListIds: [],
        seenListIds: [],
        highestBidsIds: [],
      });
      expect(raw?.createdAt).toBeInstanceOf(Date);
      expect(raw?.updatedAt).toBeInstanceOf(Date);
      expect(await bcrypt.compare("a long password", raw!.hashedPassword)).toBe(
        true,
      );
      expect(
        await connection.database
          .collection("User")
          .findOne({ _id: new ObjectId(id) }, { promoteLongs: false }),
      ).toMatchObject({
        _id: new ObjectId(id),
        role: "USER",
        watchListIds: [],
        outbidEmailsEnabled: true,
      });
    });

    it("matches literal emails, limits collisions, and preserves exact legacy access", async () => {
      await repositories.users.create({ email: "First.Last+tag@Example.com" });
      await repositories.users.create({ email: "firstXlastttag@example.com" });
      await repositories.users.create({
        email: "first.last+tag@example.com\n",
      });
      expect(
        await repositories.users.emailMatches("first.last+tag@example.com"),
      ).toHaveLength(1);
      expect(
        await repositories.users.passwordMatches("FIRST.LAST+TAG@EXAMPLE.COM"),
      ).toHaveLength(1);
      expect(
        await repositories.users.emailExists("first.last@example.com"),
      ).toBe(false);
      await repositories.users.create({ email: "first.last+tag@example.com" });
      expect(
        await repositories.users.emailMatches("FIRST.LAST+TAG@example.com"),
      ).toHaveLength(2);
      await expect(
        authOptions.adapter!.getUserByEmail!("FIRST.LAST+TAG@example.com"),
      ).rejects.toThrow("account support");
      expect(
        await repositories.users.byEmail("First.Last+tag@Example.com"),
      ).toMatchObject({ email: "First.Last+tag@Example.com" });
    });

    it("arbitrates concurrent canonical password/OAuth signup with the existing unique index", async () => {
      const results = await Promise.allSettled([
        register(
          request({
            name: "Driver",
            email: "Driver@Example.COM",
            password: "a long password",
          }),
        ),
        authOptions.adapter!.createUser!({
          email: "DRIVER@example.com",
          emailVerified: null,
        }),
      ]);
      expect(
        results.filter(
          (item) =>
            item.status === "fulfilled" &&
            (!(item.value instanceof Response) || item.value.status === 201),
        ),
      ).toHaveLength(1);
      expect(await repositories.users.count()).toBe(1);
      expect(
        await repositories.users.byEmail("driver@example.com"),
      ).not.toBeNull();
    });

    it.each(["github", "google"])(
      "supports %s signup and stable provider-subject login without email merging",
      async (provider) => {
        const first = await oauth(provider, "New.Driver@Example.COM");
        expect(first.isNewUser).toBe(true);
        expect(first.user).toEqual({
          id: first.user.id,
          name: "Driver",
          email: "new.driver@example.com",
          emailVerified: null,
          image: null,
        });
        const account = await connection.database
          .collection("Account")
          .findOne({ provider });
        expect(account?.userId).toEqual(new ObjectId(first.user.id));
        expect(account?._id).toBeInstanceOf(ObjectId);
        const again = await oauth(provider, "changed@example.com");
        expect(again.user.id).toBe(first.user.id);
        expect(again.isNewUser).toBe(false);
        await expect(
          oauth(
            provider,
            "NEW.DRIVER@example.com",
            undefined,
            "another-subject",
          ),
        ).rejects.toMatchObject({ name: "AccountNotLinkedError" });
        expect(
          await connection.database.collection("Account").countDocuments(),
        ).toBe(1);
      },
    );

    it.each(["github", "google"])(
      "blocks %s provider planting into a password account",
      async (provider) => {
        const user = await repositories.users.create({
          email: "owner@example.com",
          hashedPassword: "password-hash",
        });
        const token = await encode({
          secret,
          token: { sub: user.id, email: user.email },
        });
        await expect(
          oauth(provider, "attacker@example.com", token),
        ).rejects.toMatchObject({ name: "LinkAccountError" });
        await expect(
          oauth(provider, "OWNER@example.com"),
        ).rejects.toMatchObject({ name: "AccountNotLinkedError" });
        expect(
          await connection.database.collection("Account").countDocuments(),
        ).toBe(0);
      },
    );

    it("stores only allowed OAuth fields using ObjectIds and BSON longs, with unique provider subjects", async () => {
      const user = await repositories.users.create({
        email: "oauth@example.com",
      });
      const input = {
        userId: user.id,
        provider: "github",
        providerAccountId: "subject",
        type: "oauth" as const,
        access_token: "token",
        refresh_token: "refresh",
        expires_at: 1800000000,
        refresh_token_expires_in: 3600,
        role: "ADMIN",
        arbitrary: "private",
      };
      await authOptions.adapter!.linkAccount!(input);
      const raw = await connection.database
        .collection("Account")
        .findOne({ provider: "github" }, { promoteLongs: false });
      expect(Long.isLong(raw?.expires_at)).toBe(true);
      expect(raw?.refresh_token_expires_in.toNumber()).toBe(3600);
      expect(raw).not.toHaveProperty("role");
      expect(raw).not.toHaveProperty("arbitrary");
      await expect(
        authOptions.adapter!.linkAccount!(input),
      ).rejects.toMatchObject({ code: 11000 });
      expect(
        await connection.database
          .collection("Account")
          .findOne(
            { provider: "github", providerAccountId: "subject" },
            { promoteLongs: false },
          ),
      ).toMatchObject({
        userId: new ObjectId(user.id),
        expires_at: Long.fromNumber(1800000000),
        refresh_token_expires_in: Long.fromNumber(3600),
      });
      await authOptions.adapter!.unlinkAccount!({
        provider: "github",
        providerAccountId: "subject",
      });
      expect(
        await authOptions.adapter!.getUserByAccount!({
          provider: "github",
          providerAccountId: "subject",
        }),
      ).toBeNull();
    });

    it("keeps credential login and JWT revocation working across a native password reset", async () => {
      const user = await repositories.users.create({
        email: "Legacy@Example.COM",
        hashedPassword: await bcrypt.hash("old password", 4),
      });
      const credentials = authOptions.providers.find(
        (item) => item.id === "credentials",
      ) as CredentialsConfig;
      const login = () =>
        credentials.options!.authorize!(
          { email: "LEGACY@example.com", password: "old password" },
          { body: {}, query: {}, headers: {}, method: "POST" },
        );
      const signedIn = await login();
      expect(signedIn).toMatchObject({
        id: user.id,
        email: user.email,
        sessionVersion: "",
      });
      const issued = await authOptions.callbacks!.jwt!({
        token: { sub: user.id, email: user.email },
        user: signedIn!,
        account: {
          provider: "credentials",
          type: "credentials",
          providerAccountId: user.id,
        },
      });
      const token = await encode({ secret, token: issued });
      expect(await decodeSessionToken({ secret, token })).toMatchObject({
        sub: user.id,
      });
      const now = new Date(),
        reset = "a".repeat(64);
      await repositories.passwordResets.replace({
        id: "test:reset",
        email: "legacy@example.com",
        nonce: "n",
        tokenHash: resetHash(reset),
        requestedAt: now,
        expiresAt: new Date(now.getTime() + 1800000),
        userId: user.id,
        sessionVersion: "",
        usedAt: null,
      });
      await resetPassword(reset, "a new long password");
      expect(await decodeSessionToken({ secret, token })).toBeNull();
      await expect(login()).rejects.toThrow("Invalid Credentials");
      const fresh = await credentials.options!.authorize!(
        { email: "legacy@example.com", password: "a new long password" },
        { body: {}, query: {}, headers: {}, method: "POST" },
      );
      expect(fresh).toMatchObject({ id: user.id, email: user.email });
      expect(fresh?.sessionVersion).not.toBe("");
    });

    it("limits account mutations and DTOs and checks the current stored admin role", async () => {
      const user = await repositories.users.create({
        email: "Owner@Example.COM",
        name: "Owner",
        hashedPassword: "hash",
      });
      state.session = { user: { email: user.email!, role: "ADMIN" } };
      await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
      await expect(
        changeAdminRole(["grant", "owner@example.com"], connection.database),
      ).rejects.toThrow("Account not found");
      await changeAdminRole(["grant", user.email!], connection.database);
      expect((await requireAdmin()).role).toBe("ADMIN");
      await changeAdminRole(["revoke", user.email!], connection.database);
      await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
      const updated = await profile(
        request({
          name: "Updated",
          image: "",
          role: "ADMIN",
          email: "attacker@example.com",
          hashedPassword: "attacker",
        }),
      );
      expect(await updated.json()).toEqual({
        name: "Updated",
        email: user.email,
        image: null,
      });
      expect(
        await (
          await preferences(
            request({
              outbidEmailsEnabled: false,
              role: "ADMIN",
              userId: new ObjectId().toHexString(),
            }),
          )
        ).json(),
      ).toEqual({ outbidEmailsEnabled: false });
      expect(await repositories.users.preferences(user.id)).toEqual({
        outbidEmailsEnabled: false,
        endingSoonEmailsEnabled: true,
      });
      const safe = await getCurrentUser();
      expect(safe).toMatchObject({
        name: "Updated",
        role: "USER",
        hasPassword: true,
      });
      expect(safe).not.toHaveProperty("hashedPassword");
      expect(safe).not.toHaveProperty("sessionVersion");
      expect(await repositories.users.byId(user.id)).toMatchObject({
        hashedPassword: "hash",
        email: user.email,
        role: "USER",
      });
    });

    it("rejects adapter email changes and ignores privilege fields during profile updates", async () => {
      const user = await repositories.users.create({
        email: "Owner@Example.COM",
      });
      await expect(
        authOptions.adapter!.updateUser!({
          id: user.id,
          email: "changed@example.com",
        }),
      ).rejects.toThrow("email changes");
      const data = {
        id: user.id,
        email: "owner@example.com",
        name: "Updated",
        role: "ADMIN",
        sessionVersion: "attacker",
        hashedPassword: "attacker",
      };
      expect(await authOptions.adapter!.updateUser!(data)).toEqual({
        id: user.id,
        email: user.email,
        name: "Updated",
        image: null,
        emailVerified: null,
      });
      expect(await repositories.users.byId(user.id)).toMatchObject({
        role: "USER",
        sessionVersion: null,
        hashedPassword: null,
        email: user.email,
      });
      expect(authOptions.adapter!.createSession).toBeUndefined();
      expect(authOptions.adapter!.deleteUser).toBeUndefined();
      expect(await repositories.users.byId("invalid-id")).toBeNull();
      await connection.database
        .collection("User")
        .deleteOne({ _id: new ObjectId(user.id) });
      await expect(
        authOptions.adapter!.linkAccount!({
          userId: user.id,
          provider: "github",
          providerAccountId: "missing",
          type: "oauth",
        }),
      ).rejects.toThrow();
      expect(
        await connection.database.collection("Account").countDocuments(),
      ).toBe(0);
    });
  },
);
