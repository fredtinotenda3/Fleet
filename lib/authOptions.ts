import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "./mongodb";
import { compare } from "bcryptjs";
import { AuthOptions } from "next-auth";
import { ObjectId } from "mongodb";
import { JWT } from "next-auth/jwt";

interface User {
  _id: ObjectId;
  Email: string;
  Password: string;
  FirstName: string;
  Role?: string;
}

interface CustomToken extends JWT {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  roles?: string[];
  tenantId?: string;
}

interface CustomSessionUser {
  id: string;
  email: string;
  name: string;
  role?: string;
  roles?: string[];
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

          const isValid = await compare(credentials.password, user.Password);

          if (!isValid) {
            throw new Error("Invalid password");
          }

          return {
            id: user._id.toString(),
            name: user.FirstName,
            email: user.Email,
            role: user.Role || "admin",
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
        token.role = (user as CustomSessionUser).role || "super_admin";
        token.roles = ["super_admin", "organization_owner"];
        token.tenantId = "default";
      }
      return token as CustomToken;
    },
    async session({ session, token }) {
      const customToken = token as CustomToken;
      session.user.id = customToken.id as string;
      session.user.email = customToken.email as string;
      session.user.name = customToken.name as string;
      (session.user as CustomSessionUser).role = customToken.role;
      (session.user as CustomSessionUser).roles = customToken.roles;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).tenantId = customToken.tenantId;
      return session;
    },
  },
};