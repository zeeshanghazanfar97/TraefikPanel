import { promises as fs } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, isAuthEnabled, isValidSessionToken } from "@/lib/auth";
import { getResolvedDynamicConfigPath } from "@/lib/config-path";
import { parseDynamicYaml } from "@/lib/traefik";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  if (isAuthEnabled()) {
    const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
    if (!isValidSessionToken(token)) {
      return getUnauthorizedResponse();
    }
  }

  const configPath = getResolvedDynamicConfigPath();
  if (!configPath) {
    return NextResponse.json(
      { error: "DYNAMIC_CONFIG_PATH is missing. Set it in environment before using the editor." },
      { status: 400 }
    );
  }

  try {
    const content = await fs.readFile(configPath, "utf8");
    return NextResponse.json(
      { content, path: configPath },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    const message = error instanceof Error ? error.message : "Unknown error while reading dynamic config file.";
    if (code === "ENOENT") {
      return NextResponse.json(
        { error: `Dynamic config file was not found at ${configPath}.`, path: configPath },
        { status: 404, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
      );
    }
    return NextResponse.json(
      { error: message, path: configPath },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }
}

export async function PUT(request: Request) {
  if (isAuthEnabled()) {
    const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
    if (!isValidSessionToken(token)) {
      return getUnauthorizedResponse();
    }
  }

  const configPath = getResolvedDynamicConfigPath();
  if (!configPath) {
    return NextResponse.json(
      { error: "DYNAMIC_CONFIG_PATH is missing. Set it in environment before using the editor." },
      { status: 400 }
    );
  }

  try {
    const payload = (await request.json()) as { content?: string };
    if (typeof payload.content !== "string") {
      return NextResponse.json({ error: "Missing YAML content." }, { status: 400 });
    }

    parseDynamicYaml(payload.content);
    const normalized = payload.content.endsWith("\n") ? payload.content : `${payload.content}\n`;
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, normalized, "utf8");

    return NextResponse.json({ ok: true, path: configPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save dynamic.yml" },
      { status: 400 }
    );
  }
}
