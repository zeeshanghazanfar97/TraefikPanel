import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getResolvedDynamicConfigPath } from "@/lib/config-path";
import { parseDynamicYaml } from "@/lib/traefik";

export async function GET() {
  const configPath = getResolvedDynamicConfigPath();
  try {
    const content = await fs.readFile(configPath, "utf8");
    return NextResponse.json({ content, path: configPath });
  } catch {
    return NextResponse.json({ content: "", path: configPath });
  }
}

export async function PUT(request: Request) {
  const configPath = getResolvedDynamicConfigPath();
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
