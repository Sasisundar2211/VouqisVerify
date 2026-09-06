// Octokit factories for GitHub App auth. Tokens are always minted per-request
// from env-configured App credentials — nothing is cached or persisted.

import { App, Octokit } from "octokit";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// GITHUB_APP_PRIVATE_KEY typically arrives as a single env-var line with
// literal "\n" escapes instead of real newlines (most host dashboards don't
// support multi-line values) — restore them before handing the PEM to the JWT signer.
function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function getApp(): App {
  return new App({
    appId: requireEnv("GITHUB_APP_ID"),
    privateKey: normalizePrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY")),
  });
}

/** Installation-scoped client with a freshly minted installation token. */
export async function getInstallationOctokit(installationId: number) {
  const app = getApp();
  return app.getInstallationOctokit(installationId);
}

interface GithubOauthResponse {
  access_token?: unknown;
  error?: unknown;
}

/** Exchanges a one-time OAuth code. The returned user token is never persisted. */
export async function exchangeGithubOauthCode(code: string, redirectUri: string): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: requireEnv("GITHUB_APP_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_APP_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("GitHub OAuth exchange failed");
  const data = (await response.json()) as GithubOauthResponse;
  if (data.error || typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("GitHub OAuth exchange failed");
  }
  return data.access_token;
}

/** Proves that the authorized user can access this App installation. */
export async function verifyUserInstallationAccess(
  userToken: string,
  installationId: number,
): Promise<{ accountLogin: string } | null> {
  const octokit = new Octokit({ auth: userToken });

  for (let page = 1; ; page += 1) {
    const { data } = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
      per_page: 100,
      page,
    });
    const installation = data.installations.find((candidate) => candidate.id === installationId);
    if (installation) {
      const accountLogin =
        installation.account && "login" in installation.account ? installation.account.login : "unknown";
      return { accountLogin };
    }
    if (data.installations.length < 100) return null;
  }
}

/** Finds this GitHub App's first installation that the authorized user can access. */
export async function findUserAppInstallation(
  userToken: string,
): Promise<{ installationId: number; accountLogin: string } | null> {
  const octokit = new Octokit({ auth: userToken });
  const appId = requireEnv("GITHUB_APP_ID");

  for (let page = 1; ; page += 1) {
    const { data } = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
      per_page: 100,
      page,
    });
    const installation = data.installations.find((candidate) => String(candidate.app_id) === appId);
    if (installation) {
      const accountLogin =
        installation.account && "login" in installation.account ? installation.account.login : "unknown";
      return { installationId: installation.id, accountLogin };
    }
    if (data.installations.length < 100) return null;
  }
}
