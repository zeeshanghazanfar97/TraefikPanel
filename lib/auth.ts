import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_COOKIE = "traefik_panel_session";

function getRawAuthValues() {
  const username = process.env.AUTH_USERNAME?.trim() ?? "";
  const password = process.env.AUTH_PASSWORD?.trim() ?? "";
  return { username, password };
}

export function isAuthEnabled(): boolean {
  const { username, password } = getRawAuthValues();
  return Boolean(username) && Boolean(password);
}

function buildToken(username: string, password: string): string {
  return createHash("sha256").update(`${username}\u0000${password}`).digest("hex");
}

export function getExpectedSessionToken(): string | null {
  const { username, password } = getRawAuthValues();
  if (!username || !password) {
    return null;
  }
  return buildToken(username, password);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  if (first.length !== second.length) {
    return false;
  }
  return timingSafeEqual(first, second);
}

export function verifyAuthCredentials(username: string, password: string): boolean {
  const { username: expectedUsername, password: expectedPassword } = getRawAuthValues();
  if (!expectedUsername || !expectedPassword) {
    return false;
  }
  return timingSafeEqualString(username, expectedUsername) && timingSafeEqualString(password, expectedPassword);
}

export function isValidSessionToken(token: string | null | undefined): boolean {
  if (!isAuthEnabled()) {
    return true;
  }
  if (!token) {
    return false;
  }
  const expected = getExpectedSessionToken();
  if (!expected) {
    return false;
  }
  return timingSafeEqualString(token, expected);
}
