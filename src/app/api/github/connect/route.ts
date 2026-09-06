import { NextResponse } from "next/server";
import { createGithubStateNonce } from "@/lib/github/connection";
import { clearGithubConnectionCookies, setOauthStateCookie } from "@/lib/github/session";

export async function GET() {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !appUrl) {
    return NextResponse.json({ error: "GitHub App is not configured on this server." }, { status: 500 });
  }

  await clearGithubConnectionCookies();
  const state = createGithubStateNonce();
  await setOauthStateCookie(state);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl}/api/github/callback`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
