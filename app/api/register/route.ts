import bcrypt from "bcrypt";

import prisma from "../../libs/prismadb";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;
    //const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return new NextResponse("Invalid Credentials", { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (error: unknown) {
    logger.error("auth.registration_failed", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
