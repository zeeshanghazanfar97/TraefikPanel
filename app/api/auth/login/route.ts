import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  getExpectedSessionToken,
  isAuthEnabled,
  verifyAuthCredentials
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }

  try {
    const payload = (await request.json()) as { username?: string; password?: string };
    const username = payload.username?.trim() ?? "";
    const password = payload.password?.trim() ?? "";

    if (!verifyAuthCredentials(username, password)) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const token = getExpectedSessionToken();
    if (!token) {
      return NextResponse.json({ error: "Authentication is not configured." }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
