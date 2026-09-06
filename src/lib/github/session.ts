import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "vouqis_session";
export const INSTALL_STATE_COOKIE = "vouqis_install_state";
export const OAUTH_STATE_COOKIE = "vouqis_oauth_state";
export const PENDING_INSTALLATION_COOKIE = "vouqis_pending_installation";

const TRANSIENT_MAX_AGE_SECONDS = 60 * 10;

export interface SessionData {
  installationId: number;
  accountLogin: string;
  connectedAt: string;
}

interface ExpiringState {
  value: string;
  expiresAt: number;
}

interface PendingInstallation {
  installationId: number;
  expiresAt: number;
}

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing required environment variable: SESSION_SECRET");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function decrypt(token: string): unknown | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", getKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionData(value: unknown): value is SessionData {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.installationId) &&
    (value.installationId as number) > 0 &&
    typeof value.accountLogin === "string" &&
    typeof value.connectedAt === "string"
  );
}

function isUnexpired(expiresAt: unknown): expiresAt is number {
  return typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function statesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function encryptSession(data: SessionData): string {
  return encrypt(data);
}

export function decryptSession(token: string): SessionData | null {
  const value = decrypt(token);
  return isSessionData(value) ? value : null;
}

export async function setSessionCookie(data: SessionData): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encryptSession(data), COOKIE_OPTIONS);
}

export async function getSessionCookie(): Promise<SessionData | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? decryptSession(token) : null;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

async function setStateCookie(name: string, state: string): Promise<void> {
  const store = await cookies();
  const value: ExpiringState = {
    value: state,
    expiresAt: Date.now() + TRANSIENT_MAX_AGE_SECONDS * 1000,
  };
  store.set(name, encrypt(value), { ...COOKIE_OPTIONS, maxAge: TRANSIENT_MAX_AGE_SECONDS });
}

async function consumeStateCookie(name: string, receivedState: string | null): Promise<boolean> {
  const store = await cookies();
  const token = store.get(name)?.value;
  store.delete(name);
  if (!token || !receivedState) return false;

  const value = decrypt(token);
  return (
    isRecord(value) &&
    typeof value.value === "string" &&
    isUnexpired(value.expiresAt) &&
    statesMatch(receivedState, value.value)
  );
}

export async function setInstallStateCookie(state: string): Promise<void> {
  await setStateCookie(INSTALL_STATE_COOKIE, state);
}

export async function consumeInstallStateCookie(receivedState: string | null): Promise<boolean> {
  return consumeStateCookie(INSTALL_STATE_COOKIE, receivedState);
}

export async function setOauthStateCookie(state: string): Promise<void> {
  await setStateCookie(OAUTH_STATE_COOKIE, state);
}

export async function consumeOauthStateCookie(receivedState: string | null): Promise<boolean> {
  return consumeStateCookie(OAUTH_STATE_COOKIE, receivedState);
}

export async function setPendingInstallationCookie(installationId: number): Promise<void> {
  const store = await cookies();
  const value: PendingInstallation = {
    installationId,
    expiresAt: Date.now() + TRANSIENT_MAX_AGE_SECONDS * 1000,
  };
  store.set(PENDING_INSTALLATION_COOKIE, encrypt(value), {
    ...COOKIE_OPTIONS,
    maxAge: TRANSIENT_MAX_AGE_SECONDS,
  });
}

export async function consumePendingInstallationCookie(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(PENDING_INSTALLATION_COOKIE)?.value;
  store.delete(PENDING_INSTALLATION_COOKIE);
  if (!token) return null;

  const value = decrypt(token);
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.installationId) ||
    (value.installationId as number) <= 0 ||
    !isUnexpired(value.expiresAt)
  ) {
    return null;
  }
  return value.installationId as number;
}

export async function clearGithubConnectionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(INSTALL_STATE_COOKIE);
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(PENDING_INSTALLATION_COOKIE);
}
