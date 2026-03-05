"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Eye, EyeOff, LogOut, RefreshCw, Save } from "lucide-react";
import {
  createEmptyDisabledCollections,
  extractDisabledCollections,
  ensureConfigShape,
  getArrayAtPath,
  getMapAtPath,
  parseDynamicYaml,
  setArrayAtPath,
  setMapAtPath,
  toDynamicYamlWithDisabled,
  type DisabledArrayItem,
  type DisabledCollections,
  type NamedRecord,
  type TraefikDynamicConfig
} from "@/lib/traefik";
import { templates } from "@/lib/templates";
import { ArrayObjectEditor } from "@/components/editor/array-object-editor";
import { MapObjectEditor } from "@/components/editor/map-object-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type SaveState = "idle" | "saving" | "saved" | "error";

const SECTION_META = [
  { path: ["http", "routers"], label: "HTTP Routers" },
  { path: ["http", "services"], label: "HTTP Services" },
  { path: ["http", "middlewares"], label: "HTTP Middlewares" },
  { path: ["tcp", "routers"], label: "TCP Routers" },
  { path: ["tcp", "services"], label: "TCP Services" },
  { path: ["udp", "routers"], label: "UDP Routers" },
  { path: ["udp", "services"], label: "UDP Services" },
  { path: ["tls", "certificates"], label: "TLS Certificates", isArray: true }
] as const;

function countEntries(config: TraefikDynamicConfig, disabled: DisabledCollections) {
  const enabledCount = SECTION_META.reduce((count, section) => {
    if ("isArray" in section && section.isArray) {
      return count + getArrayAtPath(config, section.path).length;
    }
    return count + Object.keys(getMapAtPath(config, section.path)).length;
  }, 0);

  const disabledMapCount = Object.values(disabled.maps).reduce((count, map) => count + Object.keys(map).length, 0);
  const disabledArrayCount = Object.values(disabled.arrays).reduce((count, items) => count + items.length, 0);
  return enabledCount + disabledMapCount + disabledArrayCount;
}

const MAX_DETAILS_PER_ITEM = 8;
const MAX_MODAL_CHANGES = 250;

type ChangeType = "added" | "removed" | "edited" | "disabled" | "enabled";

type SaveChangeItem = {
  type: ChangeType;
  section: string;
  name: string;
  details: string[];
};

type SaveChangeOverview = {
  additions: number;
  removals: number;
  edits: number;
  disabled: number;
  enabled: number;
  changed: boolean;
  truncated: boolean;
  items: SaveChangeItem[];
};

const MAP_COMPARE_SECTIONS = [
  { path: ["http", "routers"] as const, label: "HTTP Router" },
  { path: ["http", "services"] as const, label: "HTTP Service" },
  { path: ["http", "middlewares"] as const, label: "HTTP Middleware" },
  { path: ["http", "serversTransports"] as const, label: "HTTP ServersTransport" },
  { path: ["tcp", "routers"] as const, label: "TCP Router" },
  { path: ["tcp", "services"] as const, label: "TCP Service" },
  { path: ["tcp", "middlewares"] as const, label: "TCP Middleware" },
  { path: ["tcp", "serversTransports"] as const, label: "TCP ServersTransport" },
  { path: ["udp", "routers"] as const, label: "UDP Router" },
  { path: ["udp", "services"] as const, label: "UDP Service" },
  { path: ["tls", "options"] as const, label: "TLS Option Set" },
  { path: ["tls", "stores"] as const, label: "TLS Store" }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function collectFieldDetails(before: unknown, after: unknown, prefix = ""): string[] {
  const details: string[] = [];

  const walk = (left: unknown, right: unknown, path: string) => {
    if (details.length >= MAX_DETAILS_PER_ITEM) return;
    if (deepEqual(left, right)) return;

    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) {
        details.push(`${path || "value"} length ${left.length} -> ${right.length}`);
      }
      const max = Math.max(left.length, right.length);
      for (let i = 0; i < max && details.length < MAX_DETAILS_PER_ITEM; i += 1) {
        const nextPath = `${path}[${i}]`;
        if (i >= left.length) {
          details.push(`${nextPath} added`);
        } else if (i >= right.length) {
          details.push(`${nextPath} removed`);
        } else if (!deepEqual(left[i], right[i])) {
          walk(left[i], right[i], nextPath);
        }
      }
      return;
    }

    if (isRecord(left) && isRecord(right)) {
      const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
      for (const key of keys) {
        if (details.length >= MAX_DETAILS_PER_ITEM) break;
        const nextPath = path ? `${path}.${key}` : key;
        if (!Object.prototype.hasOwnProperty.call(left, key)) {
          details.push(`${nextPath} added`);
        } else if (!Object.prototype.hasOwnProperty.call(right, key)) {
          details.push(`${nextPath} removed`);
        } else {
          walk(left[key], right[key], nextPath);
        }
      }
      return;
    }

    details.push(`${path || "value"} changed`);
  };

  walk(before, after, prefix);
  return details;
}

function getDisabledMapForPath(disabled: DisabledCollections, path: readonly string[]): NamedRecord {
  return disabled.maps[path.join(".")] ?? {};
}

function buildSaveChangeOverview(
  beforeConfig: TraefikDynamicConfig,
  afterConfig: TraefikDynamicConfig,
  beforeDisabled: DisabledCollections,
  afterDisabled: DisabledCollections
): SaveChangeOverview {
  const items: SaveChangeItem[] = [];

  for (const section of MAP_COMPARE_SECTIONS) {
    const beforeMap = getMapAtPath(beforeConfig, section.path);
    const afterMap = getMapAtPath(afterConfig, section.path);
    const beforeDisabledMap = getDisabledMapForPath(beforeDisabled, section.path);
    const afterDisabledMap = getDisabledMapForPath(afterDisabled, section.path);

    const allKeys = Array.from(
      new Set([
        ...Object.keys(beforeMap),
        ...Object.keys(afterMap),
        ...Object.keys(beforeDisabledMap),
        ...Object.keys(afterDisabledMap)
      ])
    ).sort();

    for (const key of allKeys) {
      const beforeEnabledValue = beforeMap[key];
      const beforeDisabledValue = beforeDisabledMap[key];
      const afterEnabledValue = afterMap[key];
      const afterDisabledValue = afterDisabledMap[key];

      const beforeState = beforeEnabledValue
        ? { mode: "enabled" as const, value: beforeEnabledValue }
        : beforeDisabledValue
          ? { mode: "disabled" as const, value: beforeDisabledValue }
          : null;
      const afterState = afterEnabledValue
        ? { mode: "enabled" as const, value: afterEnabledValue }
        : afterDisabledValue
          ? { mode: "disabled" as const, value: afterDisabledValue }
          : null;

      if (!beforeState && afterState) {
        items.push({
          type: afterState.mode === "enabled" ? "added" : "disabled",
          section: section.label,
          name: key,
          details: collectFieldDetails({}, afterState.value, "").slice(0, 3)
        });
        continue;
      }

      if (beforeState && !afterState) {
        items.push({
          type: "removed",
          section: section.label,
          name: key,
          details: []
        });
        continue;
      }

      if (!beforeState || !afterState) {
        continue;
      }

      if (beforeState.mode !== afterState.mode) {
        items.push({
          type: beforeState.mode === "enabled" ? "disabled" : "enabled",
          section: section.label,
          name: key,
          details: collectFieldDetails(beforeState.value, afterState.value).slice(0, MAX_DETAILS_PER_ITEM)
        });
        continue;
      }

      if (!deepEqual(beforeState.value, afterState.value)) {
        items.push({
          type: "edited",
          section: section.label,
          name: key,
          details: collectFieldDetails(beforeState.value, afterState.value)
        });
      }
    }
  }

  const beforeTlsCerts = getArrayAtPath(beforeConfig, ["tls", "certificates"]);
  const afterTlsCerts = getArrayAtPath(afterConfig, ["tls", "certificates"]);
  const maxTls = Math.max(beforeTlsCerts.length, afterTlsCerts.length);
  for (let i = 0; i < maxTls; i += 1) {
    const label = `Certificate #${i + 1}`;
    if (i >= beforeTlsCerts.length) {
      items.push({
        type: "added",
        section: "TLS Certificate",
        name: label,
        details: collectFieldDetails({}, afterTlsCerts[i], "").slice(0, 3)
      });
      continue;
    }
    if (i >= afterTlsCerts.length) {
      items.push({
        type: "removed",
        section: "TLS Certificate",
        name: label,
        details: []
      });
      continue;
    }
    if (!deepEqual(beforeTlsCerts[i], afterTlsCerts[i])) {
      items.push({
        type: "edited",
        section: "TLS Certificate",
        name: label,
        details: collectFieldDetails(beforeTlsCerts[i], afterTlsCerts[i])
      });
    }
  }

  const additions = items.filter((item) => item.type === "added").length;
  const removals = items.filter((item) => item.type === "removed").length;
  const edits = items.filter((item) => item.type === "edited").length;
  const disabled = items.filter((item) => item.type === "disabled").length;
  const enabled = items.filter((item) => item.type === "enabled").length;
  const truncated = items.length > MAX_MODAL_CHANGES;

  return {
    additions,
    removals,
    edits,
    disabled,
    enabled,
    changed: items.length > 0,
    truncated,
    items: truncated ? items.slice(0, MAX_MODAL_CHANGES) : items
  };
}

type TraefikEditorProps = {
  initialConfig: TraefikDynamicConfig;
  initialDisabledCollections: DisabledCollections;
  configPath: string;
  authEnabled: boolean;
};

function toPathKey(path: readonly string[]): string {
  return path.join(".");
}

function createDisabledArrayId(): string {
  return `disabled_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function TraefikEditor({
  initialConfig,
  initialDisabledCollections,
  configPath,
  authEnabled
}: TraefikEditorProps) {
  const [config, setConfig] = useState<TraefikDynamicConfig>(() => ensureConfigShape(initialConfig));
  const [disabledCollections, setDisabledCollections] = useState<DisabledCollections>(
    () => initialDisabledCollections ?? createEmptyDisabledCollections()
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string>("");
  const [rawYaml, setRawYaml] = useState<string>("");
  const [rawDirty, setRawDirty] = useState(false);
  const [rawError, setRawError] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreparingSave, setIsPreparingSave] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [saveChangeOverview, setSaveChangeOverview] = useState<SaveChangeOverview>({
    additions: 0,
    removals: 0,
    edits: 0,
    disabled: 0,
    enabled: 0,
    changed: false,
    truncated: false,
    items: []
  });

  const yamlText = useMemo(
    () => toDynamicYamlWithDisabled(config, disabledCollections),
    [config, disabledCollections]
  );
  const totalEntries = useMemo(
    () => countEntries(config, disabledCollections),
    [config, disabledCollections]
  );

  useEffect(() => {
    if (!rawDirty) {
      setRawYaml(yamlText);
    }
  }, [yamlText, rawDirty]);

  const updateMap = (path: readonly string[], value: NamedRecord) => {
    setConfig((current) => ensureConfigShape(setMapAtPath(current, path, value)));
    setSaveState("idle");
  };

  const updateArray = (path: readonly string[], value: Array<Record<string, unknown>>) => {
    setConfig((current) => ensureConfigShape(setArrayAtPath(current, path, value)));
    setSaveState("idle");
  };

  const getDisabledMapByPath = (path: readonly string[]): NamedRecord => {
    return disabledCollections.maps[toPathKey(path)] ?? {};
  };

  const setDisabledMapByPath = (path: readonly string[], value: NamedRecord) => {
    const pathKey = toPathKey(path);
    setDisabledCollections((current) => ({
      ...current,
      maps: {
        ...current.maps,
        [pathKey]: value
      }
    }));
    setSaveState("idle");
  };

  const getDisabledArrayByPath = (path: readonly string[]): DisabledArrayItem[] => {
    return disabledCollections.arrays[toPathKey(path)] ?? [];
  };

  const setDisabledArrayByPath = (path: readonly string[], value: DisabledArrayItem[]) => {
    const pathKey = toPathKey(path);
    setDisabledCollections((current) => ({
      ...current,
      arrays: {
        ...current.arrays,
        [pathKey]: value
      }
    }));
    setSaveState("idle");
  };

  const toggleMapEntry = (path: readonly string[], name: string, enable: boolean) => {
    const enabledEntries = getMapAtPath(config, path);
    const disabledEntries = getDisabledMapByPath(path);

    if (enable) {
      if (!disabledEntries[name]) return;
      const nextDisabled = { ...disabledEntries };
      const entry = nextDisabled[name];
      delete nextDisabled[name];
      updateMap(path, { ...enabledEntries, [name]: entry });
      setDisabledMapByPath(path, nextDisabled);
      return;
    }

    if (!enabledEntries[name]) return;
    const nextEnabled = { ...enabledEntries };
    const entry = nextEnabled[name];
    delete nextEnabled[name];
    updateMap(path, nextEnabled);
    setDisabledMapByPath(path, { ...disabledEntries, [name]: entry });
  };

  const deleteDisabledMapEntry = (path: readonly string[], name: string) => {
    const disabledEntries = getDisabledMapByPath(path);
    if (!disabledEntries[name]) return;
    const nextDisabled = { ...disabledEntries };
    delete nextDisabled[name];
    setDisabledMapByPath(path, nextDisabled);
  };

  const toggleArrayEntry = (path: readonly string[], payload: { index?: number; id?: string }, enable: boolean) => {
    const enabledItems = getArrayAtPath(config, path);
    const disabledItems = getDisabledArrayByPath(path);

    if (enable) {
      if (!payload.id) return;
      const target = disabledItems.find((item) => item.id === payload.id);
      if (!target) return;
      const nextDisabled = disabledItems.filter((item) => item.id !== payload.id);
      updateArray(path, [...enabledItems, target.value]);
      setDisabledArrayByPath(path, nextDisabled);
      return;
    }

    if (typeof payload.index !== "number") return;
    const target = enabledItems[payload.index];
    if (!target) return;
    const nextEnabled = enabledItems.filter((_, idx) => idx !== payload.index);
    updateArray(path, nextEnabled);
    setDisabledArrayByPath(path, [...disabledItems, { id: payload.id ?? createDisabledArrayId(), value: target }]);
  };

  const deleteDisabledArrayEntry = (path: readonly string[], id: string) => {
    const disabledItems = getDisabledArrayByPath(path);
    const nextDisabled = disabledItems.filter((item) => item.id !== id);
    setDisabledArrayByPath(path, nextDisabled);
  };

  const fetchLatestConfigContent = async () => {
    const response = await fetch(`/api/config?ts=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) {
      let errorMessage = "Failed to load dynamic config file.";
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) {
          errorMessage = body.error;
        }
      } catch {
        // Keep fallback message.
      }
      throw new Error(errorMessage);
    }
    return (await response.json()) as { content: string; path: string };
  };

  const reloadFromDisk = async () => {
    setMessage("");
    setRawError("");
    try {
      const data = await fetchLatestConfigContent();
      const parsed = data.content?.trim().length ? parseDynamicYaml(data.content) : {};
      const shaped = ensureConfigShape(parsed);
      const disabled = extractDisabledCollections(data.content ?? "");
      setConfig(shaped);
      setDisabledCollections(disabled);
      setRawYaml(toDynamicYamlWithDisabled(shaped, disabled));
      setRawDirty(false);
      setSaveState("idle");
      setMessage(`Reloaded config from ${data.path}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read configured dynamic file.");
      setSaveState("error");
    }
  };

  const prepareSaveConfirmation = async () => {
    setMessage("");
    setRawError("");
    setIsPreparingSave(true);

    try {
      const data = await fetchLatestConfigContent();
      const currentConfig = ensureConfigShape(parseDynamicYaml(data.content ?? ""));
      const currentDisabled = extractDisabledCollections(data.content ?? "");
      const overview = buildSaveChangeOverview(currentConfig, config, currentDisabled, disabledCollections);
      setSaveChangeOverview(overview);
      setIsConfirmDialogOpen(true);
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to prepare save preview.");
    } finally {
      setIsPreparingSave(false);
    }
  };

  const confirmAndSave = async () => {
    setSaveState("saving");
    setMessage("");

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: yamlText })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to write dynamic.yml");
      }

      setSaveState("saved");
      setMessage(`Saved to ${configPath}.`);
      setIsConfirmDialogOpen(false);
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to save configured dynamic file.");
    }
  };

  const downloadYaml = () => {
    const blob = new Blob([yamlText], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dynamic.yml";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const applyRawYaml = () => {
    try {
      const parsed = parseDynamicYaml(rawYaml);
      const shaped = ensureConfigShape(parsed);
      const disabled = extractDisabledCollections(rawYaml);
      setConfig(shaped);
      setDisabledCollections(disabled);
      setRawDirty(false);
      setRawError("");
      setSaveState("idle");
      setMessage("Raw YAML applied to visual editor.");
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "Invalid YAML");
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription>Total managed objects</CardDescription>
            <CardTitle className="text-3xl">{totalEntries}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription>File target</CardDescription>
            <CardTitle className="break-all text-base">{configPath}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="success">Traefik file provider</Badge>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription>Actions</CardDescription>
            <CardTitle className="text-sm text-muted-foreground">Load, edit, validate, and save</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reloadFromDisk}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reload
            </Button>
            <Button onClick={prepareSaveConfirmation} disabled={saveState === "saving" || isPreparingSave}>
              <Save className="mr-2 h-4 w-4" />{" "}
              {isPreparingSave ? "Preparing..." : saveState === "saving" ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" onClick={downloadYaml}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button variant="outline" onClick={() => setIsPreviewOpen((current) => !current)}>
              {isPreviewOpen ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {isPreviewOpen ? "Hide Preview" : "Show Preview"}
            </Button>
            {authEnabled ? (
              <Button variant="outline" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {message ? (
        <Alert variant={saveState === "error" ? "destructive" : "default"} className="mb-6 bg-card/90">
          {saveState === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          <AlertTitle>{saveState === "error" ? "Action failed" : "Status"}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog
        open={isConfirmDialogOpen}
        onOpenChange={(open) => {
          if (saveState !== "saving") {
            setIsConfirmDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Confirm Save</DialogTitle>
            <DialogDescription>Review this overview before writing changes to disk.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Added: {saveChangeOverview.additions}</Badge>
            <Badge variant="outline">Removed: {saveChangeOverview.removals}</Badge>
            <Badge variant="secondary">Edited: {saveChangeOverview.edits}</Badge>
            <Badge variant="secondary">Disabled: {saveChangeOverview.disabled}</Badge>
            <Badge variant="secondary">Enabled: {saveChangeOverview.enabled}</Badge>
            {saveChangeOverview.changed ? null : <Badge variant="secondary">No changes</Badge>}
          </div>

          <ScrollArea className="h-[420px] rounded-md border bg-muted/40 p-3">
            <div className="space-y-2 text-sm">
              {saveChangeOverview.items.length === 0 ? (
                <p className="text-muted-foreground">No config changes detected.</p>
              ) : (
                saveChangeOverview.items.map((item, index) => (
                  <div key={`${item.type}-${item.section}-${item.name}-${index}`} className="rounded-md border bg-card/80 p-3">
                    <p className="font-medium">
                      {item.type === "added"
                        ? "Add"
                        : item.type === "removed"
                          ? "Remove"
                          : item.type === "edited"
                            ? "Edit"
                            : item.type === "disabled"
                              ? "Disable"
                              : "Enable"}{" "}
                      {item.section}:{" "}
                      <span className="font-semibold">{item.name}</span>
                    </p>
                    {item.details.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{item.details.join(" • ")}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">No field-level details.</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {saveChangeOverview.truncated ? (
            <p className="text-xs text-muted-foreground">
              Change list is truncated for readability.
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsConfirmDialogOpen(false)} disabled={saveState === "saving"}>
              Cancel
            </Button>
            <Button onClick={confirmAndSave} disabled={saveState === "saving"}>
              {saveState === "saving" ? "Saving..." : "Confirm Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={isPreviewOpen ? "grid gap-6 xl:grid-cols-[1.2fr_0.8fr]" : "grid gap-6"}>
        <Card className="bg-card/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Visual Dynamic Config Editor</CardTitle>
            <CardDescription>
              Uses Traefik dynamic sections (`http`, `tcp`, `udp`, `tls`) and keeps full YAML flexibility per item.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="http">
              <TabsList>
                <TabsTrigger value="http">HTTP</TabsTrigger>
                <TabsTrigger value="tcp">TCP</TabsTrigger>
                <TabsTrigger value="udp">UDP</TabsTrigger>
                <TabsTrigger value="tls">TLS</TabsTrigger>
                <TabsTrigger value="raw">Raw YAML</TabsTrigger>
              </TabsList>

              <TabsContent value="http" className="space-y-4">
                <MapObjectEditor
                  title="HTTP Routers"
                  description="Rules, entryPoints, TLS, middlewares and service binding."
                  itemLabel="Router"
                  entries={getMapAtPath(config, ["http", "routers"])}
                  disabledEntries={getDisabledMapByPath(["http", "routers"])}
                  template={templates.httpRouter}
                  onChange={(next) => updateMap(["http", "routers"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["http", "routers"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["http", "routers"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["http", "routers"], entryName)}
                />
                <MapObjectEditor
                  title="HTTP Services"
                  description="Load balancer, weighted, mirroring, or failover service definitions."
                  itemLabel="Service"
                  entries={getMapAtPath(config, ["http", "services"])}
                  disabledEntries={getDisabledMapByPath(["http", "services"])}
                  template={templates.httpService}
                  onChange={(next) => updateMap(["http", "services"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["http", "services"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["http", "services"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["http", "services"], entryName)}
                />
                <MapObjectEditor
                  title="HTTP Middlewares"
                  description="Any middleware type, including plugins and chain definitions."
                  itemLabel="Middleware"
                  entries={getMapAtPath(config, ["http", "middlewares"])}
                  disabledEntries={getDisabledMapByPath(["http", "middlewares"])}
                  template={templates.httpMiddleware}
                  onChange={(next) => updateMap(["http", "middlewares"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["http", "middlewares"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["http", "middlewares"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["http", "middlewares"], entryName)}
                />
                <MapObjectEditor
                  title="HTTP Servers Transports"
                  description="Backend connection transport options for HTTP services."
                  itemLabel="Transport"
                  entries={getMapAtPath(config, ["http", "serversTransports"])}
                  disabledEntries={getDisabledMapByPath(["http", "serversTransports"])}
                  template={templates.httpServersTransport}
                  onChange={(next) => updateMap(["http", "serversTransports"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["http", "serversTransports"], next)}
                  onToggleEntry={(entryName, enable) =>
                    toggleMapEntry(["http", "serversTransports"], entryName, enable)
                  }
                  onDeleteDisabledEntry={(entryName) =>
                    deleteDisabledMapEntry(["http", "serversTransports"], entryName)
                  }
                />
              </TabsContent>

              <TabsContent value="tcp" className="space-y-4">
                <MapObjectEditor
                  title="TCP Routers"
                  description="HostSNI rules, entry points, middleware and TLS passthrough settings."
                  itemLabel="Router"
                  entries={getMapAtPath(config, ["tcp", "routers"])}
                  disabledEntries={getDisabledMapByPath(["tcp", "routers"])}
                  template={templates.tcpRouter}
                  onChange={(next) => updateMap(["tcp", "routers"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["tcp", "routers"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["tcp", "routers"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["tcp", "routers"], entryName)}
                />
                <MapObjectEditor
                  title="TCP Services"
                  description="TCP load balancer definitions and server addresses."
                  itemLabel="Service"
                  entries={getMapAtPath(config, ["tcp", "services"])}
                  disabledEntries={getDisabledMapByPath(["tcp", "services"])}
                  template={templates.tcpService}
                  onChange={(next) => updateMap(["tcp", "services"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["tcp", "services"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["tcp", "services"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["tcp", "services"], entryName)}
                />
                <MapObjectEditor
                  title="TCP Middlewares"
                  description="MiddlewareTCP definitions such as IP allow list and InFlightConn."
                  itemLabel="Middleware"
                  entries={getMapAtPath(config, ["tcp", "middlewares"])}
                  disabledEntries={getDisabledMapByPath(["tcp", "middlewares"])}
                  template={templates.tcpMiddleware}
                  onChange={(next) => updateMap(["tcp", "middlewares"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["tcp", "middlewares"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["tcp", "middlewares"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["tcp", "middlewares"], entryName)}
                />
                <MapObjectEditor
                  title="TCP Servers Transports"
                  description="Transport tuning for TLS and connection behavior to TCP backends."
                  itemLabel="Transport"
                  entries={getMapAtPath(config, ["tcp", "serversTransports"])}
                  disabledEntries={getDisabledMapByPath(["tcp", "serversTransports"])}
                  template={templates.tcpServersTransport}
                  onChange={(next) => updateMap(["tcp", "serversTransports"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["tcp", "serversTransports"], next)}
                  onToggleEntry={(entryName, enable) =>
                    toggleMapEntry(["tcp", "serversTransports"], entryName, enable)
                  }
                  onDeleteDisabledEntry={(entryName) =>
                    deleteDisabledMapEntry(["tcp", "serversTransports"], entryName)
                  }
                />
              </TabsContent>

              <TabsContent value="udp" className="space-y-4">
                <MapObjectEditor
                  title="UDP Routers"
                  description="UDP entryPoints and service associations."
                  itemLabel="Router"
                  entries={getMapAtPath(config, ["udp", "routers"])}
                  disabledEntries={getDisabledMapByPath(["udp", "routers"])}
                  template={templates.udpRouter}
                  onChange={(next) => updateMap(["udp", "routers"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["udp", "routers"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["udp", "routers"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["udp", "routers"], entryName)}
                />
                <MapObjectEditor
                  title="UDP Services"
                  description="UDP load balancer and server addresses."
                  itemLabel="Service"
                  entries={getMapAtPath(config, ["udp", "services"])}
                  disabledEntries={getDisabledMapByPath(["udp", "services"])}
                  template={templates.udpService}
                  onChange={(next) => updateMap(["udp", "services"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["udp", "services"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["udp", "services"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["udp", "services"], entryName)}
                />
              </TabsContent>

              <TabsContent value="tls" className="space-y-4">
                <ArrayObjectEditor
                  title="TLS Certificates"
                  description="Static cert/key files for dynamic TLS attachment."
                  itemLabel="Certificate"
                  items={getArrayAtPath(config, ["tls", "certificates"])}
                  disabledItems={getDisabledArrayByPath(["tls", "certificates"])}
                  template={templates.tlsCertificate}
                  onChange={(next) => updateArray(["tls", "certificates"], next)}
                  onChangeDisabled={(next) => setDisabledArrayByPath(["tls", "certificates"], next)}
                  onToggleItem={(payload, enable) => toggleArrayEntry(["tls", "certificates"], payload, enable)}
                  onDeleteDisabledItem={(id) => deleteDisabledArrayEntry(["tls", "certificates"], id)}
                />
                <MapObjectEditor
                  title="TLS Options"
                  description="Cipher suites, min/max versions, and SNI strictness sets."
                  itemLabel="TLS Option Set"
                  entries={getMapAtPath(config, ["tls", "options"])}
                  disabledEntries={getDisabledMapByPath(["tls", "options"])}
                  template={templates.tlsOption}
                  onChange={(next) => updateMap(["tls", "options"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["tls", "options"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["tls", "options"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["tls", "options"], entryName)}
                />
                <MapObjectEditor
                  title="TLS Stores"
                  description="Default certificates and store-level mappings."
                  itemLabel="TLS Store"
                  entries={getMapAtPath(config, ["tls", "stores"])}
                  disabledEntries={getDisabledMapByPath(["tls", "stores"])}
                  template={templates.tlsStore}
                  onChange={(next) => updateMap(["tls", "stores"], next)}
                  onChangeDisabled={(next) => setDisabledMapByPath(["tls", "stores"], next)}
                  onToggleEntry={(entryName, enable) => toggleMapEntry(["tls", "stores"], entryName, enable)}
                  onDeleteDisabledEntry={(entryName) => deleteDisabledMapEntry(["tls", "stores"], entryName)}
                />
              </TabsContent>

              <TabsContent value="raw" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Use this tab for direct full-file editing. Apply updates to sync back into the visual editor.
                </p>
                <Textarea
                  className="min-h-[460px] font-mono text-xs"
                  value={rawYaml}
                  onChange={(event) => {
                    setRawYaml(event.target.value);
                    setRawDirty(true);
                    setRawError("");
                  }}
                />
                {rawError ? <p className="text-sm text-destructive">{rawError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={applyRawYaml}>Apply to Visual Editor</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRawYaml(yamlText);
                      setRawDirty(false);
                      setRawError("");
                    }}
                  >
                    Reset from Visual
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {isPreviewOpen ? (
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Live YAML Preview</CardTitle>
              <CardDescription>
                Generated from the current visual state. Saved output is validated before writing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[70vh] rounded-md border bg-muted/40 p-4">
                <pre className="text-xs leading-5 text-foreground">{yamlText}</pre>
              </ScrollArea>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground">
                Tip: if Traefik supports a field that does not have dedicated quick inputs yet, edit that object body directly in
                its YAML dialog.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
