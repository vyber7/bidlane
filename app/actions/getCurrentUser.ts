import prisma from "../libs/prismadb";
import { getSession } from "./getSession";
import { logger } from "../libs/logger";
import type { CurrentUser } from "../types";

const getCurrentUser = async (): Promise<CurrentUser | null> => {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return null;
    }
    const currentUser = await prisma.user.findUnique({
      where: {
        email: session?.user?.email as string,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        hashedPassword: true,
      },
    });

    if (!currentUser) return null;

    const { hashedPassword, ...safeUser } = currentUser;
    return { ...safeUser, hasPassword: Boolean(hashedPassword) };
  } catch (error: unknown) {
    logger.error("auth.current_user_failed", error);
    return null;
  }
};

export default getCurrentUser;
