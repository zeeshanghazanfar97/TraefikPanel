import yaml from "js-yaml";

export type NamedRecord = Record<string, Record<string, unknown>>;
export type DisabledArrayItem = { id: string; value: Record<string, unknown> };
export type DisabledCollections = {
  maps: Record<string, NamedRecord>;
  arrays: Record<string, DisabledArrayItem[]>;
};

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

const MARKER_END = "@traefik-panel:end";
const MARKER_DISABLED_MAP = "@traefik-panel:disabled-map";
const MARKER_DISABLED_ARRAY = "@traefik-panel:disabled-array";

const YAML_DUMP_OPTIONS: yaml.DumpOptions = {
  lineWidth: 120,
  noRefs: true,
  sortKeys: false
};

export function createEmptyDisabledCollections(): DisabledCollections {
  return { maps: {}, arrays: {} };
}

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
  return yaml.dump(config, YAML_DUMP_OPTIONS);
}

export function extractDisabledCollections(content: string): DisabledCollections {
  const disabled = createEmptyDisabledCollections();
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const mapMarkerMatch = line.match(
      /^\s*#\s*@traefik-panel:disabled-map\s+path=([A-Za-z0-9_.-]+)\s+name=([^\s#]+)\s*$/
    );
    if (mapMarkerMatch) {
      const pathKey = mapMarkerMatch[1];
      const decodedName = safeDecodeURIComponent(mapMarkerMatch[2]);
      const { blockLines, endIndex } = collectCommentBlock(lines, i + 1);
      i = endIndex;
      if (!blockLines.length) continue;

      try {
        const parsed = yaml.load(uncommentBlock(blockLines));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        const parsedRecord = parsed as Record<string, unknown>;
        const candidateValue = parsedRecord[decodedName];
        if (!candidateValue || typeof candidateValue !== "object" || Array.isArray(candidateValue)) continue;
        if (!disabled.maps[pathKey]) disabled.maps[pathKey] = {};
        disabled.maps[pathKey][decodedName] = candidateValue as Record<string, unknown>;
      } catch {
        // Ignore malformed disabled blocks and continue parsing.
      }

      continue;
    }

    const arrayMarkerMatch = line.match(
      /^\s*#\s*@traefik-panel:disabled-array\s+path=([A-Za-z0-9_.-]+)\s+id=([^\s#]+)\s*$/
    );
    if (arrayMarkerMatch) {
      const pathKey = arrayMarkerMatch[1];
      const decodedId = safeDecodeURIComponent(arrayMarkerMatch[2]);
      const { blockLines, endIndex } = collectCommentBlock(lines, i + 1);
      i = endIndex;
      if (!blockLines.length) continue;

      try {
        const parsed = yaml.load(uncommentBlock(blockLines));
        if (!Array.isArray(parsed) || parsed.length === 0) continue;
        const candidateValue = parsed[0];
        if (!candidateValue || typeof candidateValue !== "object" || Array.isArray(candidateValue)) continue;
        if (!disabled.arrays[pathKey]) disabled.arrays[pathKey] = [];
        disabled.arrays[pathKey].push({
          id: decodedId,
          value: candidateValue as Record<string, unknown>
        });
      } catch {
        // Ignore malformed disabled blocks and continue parsing.
      }
    }
  }

  return disabled;
}

export function toDynamicYamlWithDisabled(
  config: TraefikDynamicConfig,
  disabled: DisabledCollections
): string {
  const baseYaml = toDynamicYaml(config);
  const lines = baseYaml.replace(/\r\n/g, "\n").split("\n");

  for (const [pathKey, entries] of Object.entries(disabled.maps)) {
    const entryItems = Object.entries(entries);
    if (entryItems.length === 0) continue;
    const path = pathKey.split(".");
    const sectionLineIndex = ensureSectionPath(lines, path);
    const blockIndent = getLineIndent(lines[sectionLineIndex]) + 2;

    const blocks = entryItems.flatMap(([name, value]) => {
      const snippet = yaml
        .dump({ [name]: value }, YAML_DUMP_OPTIONS)
        .trimEnd()
        .split("\n")
        .map((itemLine) => commentLine(itemLine, blockIndent));
      return [
        `${" ".repeat(blockIndent)}# ${MARKER_DISABLED_MAP} path=${pathKey} name=${encodeURIComponent(name)}`,
        ...snippet,
        `${" ".repeat(blockIndent)}# ${MARKER_END}`
      ];
    });

    insertIntoSection(lines, sectionLineIndex, blocks);
  }

  for (const [pathKey, items] of Object.entries(disabled.arrays)) {
    if (items.length === 0) continue;
    const path = pathKey.split(".");
    const sectionLineIndex = ensureSectionPath(lines, path);
    const blockIndent = getLineIndent(lines[sectionLineIndex]) + 2;
    const blocks = items.flatMap((item) => {
      const snippet = yaml
        .dump([item.value], YAML_DUMP_OPTIONS)
        .trimEnd()
        .split("\n")
        .map((itemLine) => commentLine(itemLine, blockIndent));
      return [
        `${" ".repeat(blockIndent)}# ${MARKER_DISABLED_ARRAY} path=${pathKey} id=${encodeURIComponent(item.id)}`,
        ...snippet,
        `${" ".repeat(blockIndent)}# ${MARKER_END}`
      ];
    });

    insertIntoSection(lines, sectionLineIndex, blocks);
  }

  const rendered = lines.join("\n");
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
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

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function collectCommentBlock(lines: string[], startIndex: number) {
  const blockLines: string[] = [];
  let endIndex = startIndex;

  for (let i = startIndex; i < lines.length; i += 1) {
    endIndex = i;
    if (lines[i].match(/^\s*#\s*@traefik-panel:end\s*$/)) {
      break;
    }
    blockLines.push(lines[i]);
  }

  return { blockLines, endIndex };
}

function uncommentBlock(lines: string[]): string {
  return lines
    .map((line) => line.replace(/^(\s*)# ?(.*)$/, "$1$2"))
    .join("\n");
}

function commentLine(line: string, indent: number): string {
  if (!line.trim()) {
    return `${" ".repeat(indent)}#`;
  }
  return `${" ".repeat(indent)}# ${line}`;
}

function getLineIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function findSectionEnd(lines: string[], sectionLineIndex: number): number {
  const sectionIndent = getLineIndent(lines[sectionLineIndex]);
  for (let i = sectionLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = getLineIndent(line);
    if (indent <= sectionIndent) return i;
  }
  return lines.length;
}

function findKeyLineInRange(
  lines: string[],
  key: string,
  expectedIndent: number,
  start: number,
  end: number
): number {
  for (let i = start; i < end; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (getLineIndent(line) !== expectedIndent) continue;
    const keyMatch = line.match(/^\s*([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!keyMatch) continue;
    if (keyMatch[1] !== key) continue;
    return i;
  }
  return -1;
}

function normalizeBlockSectionLine(lines: string[], lineIndex: number) {
  const line = lines[lineIndex];
  const inlineMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(\{\}|\[\])\s*$/);
  if (inlineMatch) {
    lines[lineIndex] = `${inlineMatch[1]}${inlineMatch[2]}:`;
  }
}

function ensureSectionPath(lines: string[], segments: string[]): number {
  if (segments.length === 0) {
    return 0;
  }

  let parentLineIndex = -1;
  let parentEnd = lines.length;
  let currentLineIndex = -1;

  for (let depth = 0; depth < segments.length; depth += 1) {
    const key = segments[depth];
    const expectedIndent = depth * 2;
    const searchStart = parentLineIndex === -1 ? 0 : parentLineIndex + 1;

    let found = findKeyLineInRange(lines, key, expectedIndent, searchStart, parentEnd);
    if (found === -1) {
      const insertIndex = parentEnd;
      lines.splice(insertIndex, 0, `${" ".repeat(expectedIndent)}${key}:`);
      found = insertIndex;
      if (parentLineIndex !== -1 && insertIndex <= parentLineIndex) {
        parentLineIndex += 1;
      }
      parentEnd += 1;
    }

    normalizeBlockSectionLine(lines, found);
    currentLineIndex = found;
    parentLineIndex = found;
    parentEnd = findSectionEnd(lines, found);
  }

  return currentLineIndex;
}

function insertIntoSection(lines: string[], sectionLineIndex: number, blockLines: string[]) {
  const insertIndex = findSectionEnd(lines, sectionLineIndex);
  lines.splice(insertIndex, 0, ...blockLines);
}
