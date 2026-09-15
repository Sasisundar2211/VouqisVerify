import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clearGithubConnectionCookies } from "./session";

export function createGithubStateNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function getAppHome(request: Request): string {
  const requestUrl = new URL(request.url);
  return ["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname)
    ? requestUrl.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? requestUrl.origin);
}

export async function redirectWithGithubConnectionError(
  request: Request,
  error: string,
): Promise<NextResponse> {
  await clearGithubConnectionCookies();
  return NextResponse.redirect(new URL(`/?error=${error}`, getAppHome(request)));
}
