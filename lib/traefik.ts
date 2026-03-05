import yaml from "js-yaml";

export type NamedRecord = Record<string, Record<string, unknown>>;

export type TraefikDynamicConfig = {
  http?: {
    routers?: NamedRecord;
    services?: NamedRecord;
    middlewares?: NamedRecord;
    serversTransports?: NamedRecord;
  };
  tcp?: {
    routers?: NamedRecord;
    services?: NamedRecord;
    middlewares?: NamedRecord;
    serversTransports?: NamedRecord;
  };
  udp?: {
    routers?: NamedRecord;
    services?: NamedRecord;
  };
  tls?: {
    certificates?: Array<Record<string, unknown>>;
    options?: NamedRecord;
    stores?: NamedRecord;
  };
  [key: string]: unknown;
};

export function parseDynamicYaml(content: string): TraefikDynamicConfig {
  const parsed = yaml.load(content);
  if (parsed == null) {
    return {};
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("dynamic.yml must contain a YAML object at the top level.");
  }
  return parsed as TraefikDynamicConfig;
}

export function toDynamicYaml(config: TraefikDynamicConfig): string {
  return yaml.dump(config, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false
  });
}

export function ensureConfigShape(config: TraefikDynamicConfig): TraefikDynamicConfig {
  const next = structuredClone(config) as TraefikDynamicConfig;
  const root = next as Record<string, unknown>;

  // Safety migration: if a malformed file has HTTP keys at root,
  // move them under `http` so save operations don't keep breaking Traefik.
  const httpSection = isRecord(root.http) ? (root.http as Record<string, unknown>) : undefined;
  let resolvedHttp = httpSection;
  const httpKeys = ["routers", "services", "middlewares", "serversTransports"] as const;

  for (const key of httpKeys) {
    if (!isRecord(root[key])) continue;
    if (!resolvedHttp) {
      resolvedHttp = {};
    }
    if (!isRecord(resolvedHttp[key])) {
      resolvedHttp[key] = root[key];
    }
    delete root[key];
  }

  if (resolvedHttp && resolvedHttp !== root.http) {
    root.http = resolvedHttp;
  }

  return next;
}

export function getMapAtPath(config: TraefikDynamicConfig, path: readonly string[]): NamedRecord {
  const value = getAtPath(config, path);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as NamedRecord;
}

export function setMapAtPath(
  config: TraefikDynamicConfig,
  path: readonly string[],
  value: NamedRecord
): TraefikDynamicConfig {
  return setAtPath(config, path, value) as TraefikDynamicConfig;
}

export function getArrayAtPath(
  config: TraefikDynamicConfig,
  path: readonly string[]
): Array<Record<string, unknown>> {
  const value = getAtPath(config, path);
  if (!Array.isArray(value)) {
    return [];
  }
  return value as Array<Record<string, unknown>>;
}

export function setArrayAtPath(
  config: TraefikDynamicConfig,
  path: readonly string[],
  value: Array<Record<string, unknown>>
): TraefikDynamicConfig {
  return setAtPath(config, path, value) as TraefikDynamicConfig;
}

function getAtPath(source: Record<string, unknown>, path: readonly string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object" || Array.isArray(acc)) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function setAtPath(
  source: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): Record<string, unknown> {
  const next = structuredClone(source);
  let cursor: Record<string, unknown> = next;

  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }

  cursor[path[path.length - 1]] = value;
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
