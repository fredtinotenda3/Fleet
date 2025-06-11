import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  const { firstName, email, password } = await request.json();

  if (!firstName || !email || !password) {
    return NextResponse.json(
      { message: "All fields are required" },
      { status: 400 }
    );
  }

  try {
    const db = await connectToDatabase();
    const admins = db.collection("tbladmin");

    const existingUser = await admins.findOne({
      $or: [{ Email: email }, { FirstName: firstName }],
    });

    if (existingUser) {
      return NextResponse.json(
        {
          message:
            existingUser.email === email
              ? "Email already registered"
              : "Name already taken",
        },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await admins.insertOne({
      FirstName: firstName, // Capitalized to match schema
      Email: email, // Capitalized to match schema
      Password: hashedPassword,
      createdAt: new Date(),
    });

    if (result.insertedId) {
      return NextResponse.json(
        { message: "User registered successfully" },
        { status: 201 }
      );
    } else {
      return NextResponse.json(
        { message: "Failed to create user" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
