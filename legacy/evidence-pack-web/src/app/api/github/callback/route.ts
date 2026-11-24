import { NextResponse } from "next/server";
import {
  exchangeGithubOauthCode,
  findUserAppInstallation,
  verifyUserInstallationAccess,
} from "@/lib/github/client";
import {
  createGithubStateNonce,
  getAppHome,
  redirectWithGithubConnectionError,
} from "@/lib/github/connection";
import {
  clearGithubConnectionCookies,
  consumeOauthStateCookie,
  consumePendingInstallationCookie,
  setInstallStateCookie,
  setSessionCookie,
} from "@/lib/github/session";
import { isValidGithubAppSlug } from "@/lib/github/validate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stateIsValid = await consumeOauthStateCookie(searchParams.get("state"));
  if (!stateIsValid) return redirectWithGithubConnectionError(request, "invalid_state");

  const code = searchParams.get("code");
  if (!code) return redirectWithGithubConnectionError(request, "missing_code");

  try {
    const redirectUri = `${getAppHome(request)}/api/github/callback`;
    const userToken = await exchangeGithubOauthCode(code, redirectUri);
    const pendingInstallationId = await consumePendingInstallationCookie();
    let installation: { installationId: number; accountLogin: string } | null;

    if (pendingInstallationId) {
      const verified = await verifyUserInstallationAccess(userToken, pendingInstallationId);
      installation = verified
        ? { installationId: pendingInstallationId, accountLogin: verified.accountLogin }
        : null;
      if (!installation) {
        return redirectWithGithubConnectionError(request, "unauthorized_installation");
      }
    } else {
      installation = await findUserAppInstallation(userToken);
      if (!installation) {
        const appSlug = process.env.GITHUB_APP_SLUG;
        if (!appSlug || !isValidGithubAppSlug(appSlug)) {
          return redirectWithGithubConnectionError(request, "github_authorization_failed");
        }
        const installState = createGithubStateNonce();
        await setInstallStateCookie(installState);
        const installUrl = new URL(`https://github.com/apps/${appSlug}/installations/new`);
        installUrl.searchParams.set("state", installState);
        return NextResponse.redirect(installUrl);
      }
    }

    await setSessionCookie({
      installationId: installation.installationId,
      accountLogin: installation.accountLogin,
      connectedAt: new Date().toISOString(),
    });
    await clearGithubConnectionCookies();
    return NextResponse.redirect(new URL("/", getAppHome(request)));
  } catch {
    return redirectWithGithubConnectionError(request, "github_authorization_failed");
  }
}
