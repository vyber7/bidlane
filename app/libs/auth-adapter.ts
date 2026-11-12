import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import type { AuthUser } from "@/prisma/native/auth";
import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { assertEmailAvailable, findUsersByEmailIdentity } from "./email-identity";
import { normalizeEmail } from "@/app/utils/email";

function adapterUser(user: AuthUser): AdapterUser {
  if (!user.email) throw new Error("Account email is required");
  return { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, image: user.image };
}

// This application uses JWT sessions and OAuth/credentials only. Database
// sessions, passwordless tokens and account deletion are deliberately absent;
// deletion needs an explicit cascade policy before it can be implemented.
export function nativeAuthAdapter(): Adapter {
  return {
    async createUser(data: Omit<AdapterUser, "id">) {
      const email = await assertEmailAvailable(data.email);
      return adapterUser(await getNativeRepositories().users.create({ email, name: data.name, image: data.image, emailVerified: data.emailVerified }));
    },
    async getUser(id) {
      const user = await getNativeRepositories().users.byId(id);
      return user ? adapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const users = await findUsersByEmailIdentity(email);
      if (users.length > 1) throw new Error("This email needs account support.");
      return users[0]?.email ? adapterUser(users[0]) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const repositories = getNativeRepositories();
      const id = await repositories.accounts.userId(provider, providerAccountId);
      const user = id ? await repositories.users.byId(id) : null;
      return user ? adapterUser(user) : null;
    },
    async updateUser({ id, email, ...data }) {
      const users = getNativeRepositories().users;
      if (email !== undefined) {
        const current = await users.sessionIdentity(id);
        if (!current?.email || normalizeEmail(email) !== normalizeEmail(current.email)) throw new Error("Account email changes are not supported.");
      }
      return adapterUser(await users.updateAuthProfile(id, data));
    },
    async linkAccount(account: AdapterAccount) {
      await withNativeTransaction(async ({ users, accounts }) => {
        const user = await users.byId(account.userId);
        if (!user || user.hashedPassword) throw new Error("New OAuth connections to password accounts are not supported.");
        await accounts.link(account);
      });
    },
    async unlinkAccount({ provider, providerAccountId }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      await getNativeRepositories().accounts.unlink(provider, providerAccountId);
    },
  };
}
