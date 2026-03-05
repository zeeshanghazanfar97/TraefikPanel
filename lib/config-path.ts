import os from "node:os";
import path from "node:path";

export function getDynamicConfigPathSetting(): string | null {
  let trimmed = process.env.DYNAMIC_CONFIG_PATH?.trim();
  if (!trimmed) {
    return null;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function resolveDynamicConfigPath(configuredPath: string): string {
  if (configuredPath === "~") {
    return os.homedir();
  }
  if (configuredPath.startsWith("~/")) {
    return path.join(os.homedir(), configuredPath.slice(2));
  }
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.join(process.cwd(), configuredPath);
}

export function getResolvedDynamicConfigPath(): string | null {
  const configured = getDynamicConfigPathSetting();
  if (!configured) {
    return null;
  }
  return resolveDynamicConfigPath(configured);
}
