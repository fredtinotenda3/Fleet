import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions"; // Ensure this is the correct path for your authOptions file

export default async function Home() {
  const session = await getServerSession(authOptions);

  // If user is logged in, redirect to the login page
  if (session) {
    redirect("/auth/login");
  }
}
