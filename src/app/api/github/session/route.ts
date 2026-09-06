import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionCookie } from "@/lib/github/session";

export async function GET() {
  const session = await getSessionCookie();
  if (!session) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, accountLogin: session.accountLogin });
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ connected: false });
}
