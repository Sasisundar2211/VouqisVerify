import { NextResponse } from "next/server";
import {
  createGithubStateNonce,
  getAppHome,
  redirectWithGithubConnectionError,
} from "@/lib/github/connection";
import {
  consumeInstallStateCookie,
  setOauthStateCookie,
  setPendingInstallationCookie,
} from "@/lib/github/session";
import { parseInstallationId } from "@/lib/github/validate";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationId = parseInstallationId(url.searchParams.get("installation_id"));
  if (!installationId) return redirectWithGithubConnectionError(request, "missing_installation");

  if (url.searchParams.get("setup_action") === "request") {
    return redirectWithGithubConnectionError(request, "installation_pending_approval");
  }

  if (!(await consumeInstallStateCookie(url.searchParams.get("state")))) {
    return redirectWithGithubConnectionError(request, "invalid_state");
  }

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  if (!clientId) return redirectWithGithubConnectionError(request, "github_authorization_failed");

  const oauthState = createGithubStateNonce();
  await setPendingInstallationCookie(installationId);
  await setOauthStateCookie(oauthState);

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${getAppHome(request)}/api/github/callback`);
  authorizeUrl.searchParams.set("state", oauthState);
  return NextResponse.redirect(authorizeUrl);
}
