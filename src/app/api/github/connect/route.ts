import { NextResponse } from "next/server";
import { createGithubStateNonce } from "@/lib/github/connection";
import { clearGithubConnectionCookies, setInstallStateCookie } from "@/lib/github/session";
import { isValidGithubAppSlug } from "@/lib/github/validate";

export async function GET() {
  const appSlug = process.env.GITHUB_APP_SLUG;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appSlug || !isValidGithubAppSlug(appSlug) || !clientId || !appUrl) {
    return NextResponse.json({ error: "GitHub App is not configured on this server." }, { status: 500 });
  }

  await clearGithubConnectionCookies();
  const state = createGithubStateNonce();
  await setInstallStateCookie(state);

  const url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
