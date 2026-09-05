import prisma from "../libs/prismadb";
import { getSession } from "./getSession";
import { logger } from "../libs/logger";

const getCurrentUser = async () => {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return null;
    }
    const currentUser = await prisma.user.findUnique({
      where: {
        email: session?.user?.email as string,
      },
    });

    if (!currentUser) return null;

    return currentUser;
  } catch (error: unknown) {
    logger.error("auth.current_user_failed", error);
    return null;
  }
};

export default getCurrentUser;
