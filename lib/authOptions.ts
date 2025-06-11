import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "./mongodb";
import { compare } from "bcryptjs";
import { AuthOptions } from "next-auth";
import { ObjectId } from "mongodb";

interface User {
  _id: ObjectId;
  Email: string;
  Password: string;
  FirstName: string;
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        try {
          const db = await connectToDatabase();
          const user = await db
            .collection<User>("tbladmin")
            .findOne({ Email: credentials.email });

          if (!user) {
            throw new Error("User not found");
          }

          // If using password hashing (recommended):
          const isValid = await compare(credentials.password, user.Password);
          // If NOT using hashing (not recommended):
          // const isValid = credentials.password === user.Password;

          if (!isValid) {
            throw new Error("Invalid password");
          }

          return {
            id: user._id.toString(),
            name: user.FirstName,
            email: user.Email,
          };
        } catch (error) {
          console.error("Authentication error:", error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/auth/login",
    // error: "/auth/error", // Updated path
    // signOut: "/auth/logout", // If using custom logout
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.email = token.email as string;
      session.user.name = token.name as string;
      return session;
    },
  },
};
