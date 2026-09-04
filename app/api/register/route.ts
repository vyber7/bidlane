import bcrypt from "bcrypt";

import prisma from "../../libs/prismadb";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;
    //const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      console.log("Missing Info");
      return new NextResponse("Invalid Credentials", { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
      },
    });
    console.log("User created successfully");
    return NextResponse.json(user, { status: 201 });
  } catch (error: unknown) {
    console.log(error, "REGISTRATION_ERROR");
    //console.error(error, "REGISTRATION_ERROR");
    return new NextResponse("Internal Error", { status: 500 });
  }
}
