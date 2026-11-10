import { getNativeRepositories } from "../libs/native-repositories";
import { getSession } from "./getSession";
import { logger } from "../libs/logger";
import type { CurrentUser } from "../types";

const getCurrentUser = async (): Promise<CurrentUser | null> => {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return null;
    }
    const user = await getNativeRepositories().users.byEmail(session.user.email);
    if (!user) return null;
    return {
      id: user.id, name: user.name, email: user.email, image: user.image,
      emailVerified: user.emailVerified, createdAt: user.createdAt,
      role: user.role ?? "USER", hasPassword: Boolean(user.hashedPassword),
    };
  } catch (error: unknown) {
    logger.error("auth.current_user_failed", error);
    return null;
  }
};

export default getCurrentUser;
