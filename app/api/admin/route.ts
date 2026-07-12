// app/api/admin/route.js
//
// FIX (🔴 Critical — CVE-worthy): this endpoint previously had NO auth
// check whatsoever and returned every row of tbladmin (including
// hashed passwords) to any anonymous caller. Adding requireAuth() to
// match the pattern already used elsewhere in this legacy admin area
// (see app/api/expenses/[id]/route.ts, app/api/units/route.ts) closes
// the hole with the smallest possible change. The password hash field
// is also stripped from the response — even an authenticated caller
// should never receive it over the wire.
//
// This whole tbladmin surface (admin/route.ts, admin/register,
// admin/update, admin/delete) is a pre-multi-tenancy holdover that
// predates modules/security's withAuth()/Permission system. It should
// be migrated onto that system (or removed) rather than patched
// indefinitely — flagging this for a follow-up pass rather than
// rewriting the whole subsystem here.
import connectToDatabase from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";

export const GET = async () => {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const admins = await db
      .collection("tbladmin")
      .find()
      .project({ Password: 0 }) // never return password hashes, even to authed callers
      .toArray();

    return NextResponse.json(admins, { status: 200 });
  } catch (err) {
    console.error("❌ Error fetching admins:", err);
    return NextResponse.json(
      { message: "Server error fetching admins" },
      { status: 500 }
    );
  }
};