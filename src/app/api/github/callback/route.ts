import { NextResponse } from "next/server";
import { exchangeGithubOauthCode, verifyUserInstallationAccess } from "@/lib/github/client";
import { getAppHome, redirectWithGithubConnectionError } from "@/lib/github/connection";
import {
  clearGithubConnectionCookies,
  consumeOauthStateCookie,
  consumePendingInstallationCookie,
  setSessionCookie,
} from "@/lib/github/session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stateIsValid = await consumeOauthStateCookie(searchParams.get("state"));
  if (!stateIsValid) return redirectWithGithubConnectionError(request, "invalid_state");

  const code = searchParams.get("code");
  if (!code) return redirectWithGithubConnectionError(request, "missing_code");

  const installationId = await consumePendingInstallationCookie();
  if (!installationId) return redirectWithGithubConnectionError(request, "missing_installation");

  try {
    const redirectUri = `${getAppHome(request)}/api/github/callback`;
    const userToken = await exchangeGithubOauthCode(code, redirectUri);
    const installation = await verifyUserInstallationAccess(userToken, installationId);
    if (!installation) {
      return redirectWithGithubConnectionError(request, "unauthorized_installation");
    }

    await setSessionCookie({
      installationId,
      accountLogin: installation.accountLogin,
      connectedAt: new Date().toISOString(),
    });
    await clearGithubConnectionCookies();
    return NextResponse.redirect(new URL("/", getAppHome(request)));
  } catch {
    return redirectWithGithubConnectionError(request, "github_authorization_failed");
  }
}
