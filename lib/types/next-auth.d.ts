import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name?: string;
  }

  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    email: string;
    name?: string;
  }
}
