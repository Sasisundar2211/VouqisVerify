import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clearGithubConnectionCookies } from "./session";

export function createGithubStateNonce(): string {
  return randomBytes(32).toString("base64url");
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.includes(url.hostname);
}

const HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:]+\](:\d{1,5})?$/;

function firstHeaderValue(request: Request, name: string): string | undefined {
  return request.headers.get(name)?.split(",")[0]?.trim() || undefined;
}

// `next start` behind a reverse proxy reports request.url as localhost:<port>,
// so the origin the browser visited has to come from the forwarded headers.
function getRequestOrigin(request: Request): URL {
  const url = new URL(request.url);
  const forwardedHost = firstHeaderValue(request, "x-forwarded-host") ?? firstHeaderValue(request, "host");
  const forwardedProto = firstHeaderValue(request, "x-forwarded-proto");
  const host = forwardedHost && HOST_PATTERN.test(forwardedHost) ? forwardedHost : url.host;
  const protocol =
    forwardedProto === "http" || forwardedProto === "https" ? `${forwardedProto}:` : url.protocol;
  return new URL(`${protocol}//${host}`);
}

export function getAppHome(request: Request): string {
  const requestUrl = getRequestOrigin(request);

  // Local dev always uses the request origin so the browser talks to itself.
  if (isLoopback(requestUrl)) return requestUrl.origin;

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return requestUrl.origin;

  let configuredUrl: URL;
  try {
    configuredUrl = new URL(configured);
  } catch {
    return requestUrl.origin;
  }

  // A leftover localhost value (e.g. a dev .env leaked to the host) must never
  // produce the OAuth redirect_uri for a public request: it makes GitHub reject
  // the callback with "redirect_uri is not associated with this application".
  // Fall back to the origin the user actually visited so the callback always
  // targets the host they are on.
  if (isLoopback(configuredUrl)) return requestUrl.origin;

  return configuredUrl.origin;
}

export async function redirectWithGithubConnectionError(
  request: Request,
  error: string,
): Promise<NextResponse> {
  await clearGithubConnectionCookies();
  return NextResponse.redirect(new URL(`/?error=${error}`, getAppHome(request)));
}
