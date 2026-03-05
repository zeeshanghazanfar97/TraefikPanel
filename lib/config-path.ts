import path from "node:path";

export function getDynamicConfigPathSetting(): string | null {
  const trimmed = process.env.DYNAMIC_CONFIG_PATH?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function resolveDynamicConfigPath(configuredPath: string): string {
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
