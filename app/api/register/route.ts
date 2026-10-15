import bcrypt from "bcrypt";

import prisma from "../../libs/prismadb";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import { Prisma } from "@prisma/client";
import { ApiRequestError, apiErrorResponse, errorResponse, readJsonObject } from "@/app/libs/api-request";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await readJsonObject(request);

    if (
      typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password
    ) {
      throw new ApiRequestError(400, "Name, email, and password are required");
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        hashedPassword,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("An account with this email already exists", 409);
    }
    logger.error("auth.registration_failed", error);
    return errorResponse("Unable to create account", 500);
  }
}
