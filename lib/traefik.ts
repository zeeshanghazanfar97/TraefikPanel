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
  return {
    ...config,
    http: {
      routers: {},
      services: {},
      middlewares: {},
      serversTransports: {},
      ...(config.http ?? {})
    },
    tcp: {
      routers: {},
      services: {},
      middlewares: {},
      serversTransports: {},
      ...(config.tcp ?? {})
    },
    udp: {
      routers: {},
      services: {},
      ...(config.udp ?? {})
    },
    tls: {
      certificates: [],
      options: {},
      stores: {},
      ...(config.tls ?? {})
    }
  };
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
