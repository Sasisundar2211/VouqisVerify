import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clearGithubConnectionCookies } from "./session";

export function createGithubStateNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function getAppHome(request: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

export async function redirectWithGithubConnectionError(
  request: Request,
  error: string,
): Promise<NextResponse> {
  await clearGithubConnectionCookies();
  return NextResponse.redirect(new URL(`/?error=${error}`, getAppHome(request)));
}
