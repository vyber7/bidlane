import bcrypt from "bcrypt";

import { getNativeRepositories } from "@/app/libs/native-repositories";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import { MongoServerError } from "mongodb";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { registrationSchema } from "@/app/schemas/account";
import { enforceAbuseLimit } from "@/app/libs/abuse-limits";
import { assertEmailAvailable } from "@/app/libs/email-identity";

export async function POST(request: Request) {
  try {
    const { name, email, password } = parseApiInput(registrationSchema, await readJsonObject(request, 8192));
    await enforceAbuseLimit("registration", email);
    const canonicalEmail = await assertEmailAvailable(email);

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await getNativeRepositories().users.create({ name, email: canonicalEmail, hashedPassword });
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (error instanceof MongoServerError && error.code === 11000) {
      return errorResponse("An account with this email already exists", 409);
    }
    logger.error("auth.registration_failed", error);
    return errorResponse("Unable to create account", 500);
  }
}
