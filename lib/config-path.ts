import path from "node:path";

const DEFAULT_DYNAMIC_CONFIG_PATH = "dynamic.yml";

function normalizeConfiguredPath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_DYNAMIC_CONFIG_PATH;
  }
  return trimmed;
}

export function getDynamicConfigPathSetting(): string {
  return normalizeConfiguredPath(process.env.DYNAMIC_CONFIG_PATH);
}

export function getResolvedDynamicConfigPath(): string {
  const configured = getDynamicConfigPathSetting();
  if (path.isAbsolute(configured)) {
    return configured;
  }
  return path.join(process.cwd(), configured);
}
